import { useCallback, useEffect, useRef, useState } from 'react';
import { BeerPage } from '@/components/BeerPage';
import { PageTurn, type PageTurnHandle } from '@/components/PageTurn';
import type { BeerCheckIn } from '@/lib/beerbook';
import type { FoldCorner, FoldDirection } from '@/lib/page-fold';
import { playPaperCrackle } from '@/lib/paper-crackle';
import { cn } from '@/lib/utils';

interface PageReaderProps {
  checkIns: BeerCheckIn[];
  startIndex?: number;
}

/** Axis-lock dead zone (px) before a gesture is treated as a turn. */
const LOCK_EPSILON_PX = 8;
/** Commit when the fold has progressed this far (%, out of 100). */
const COMMIT_PROGRESS = 30;
/** Or when released with this velocity toward the turn (px/ms). */
const COMMIT_VELOCITY = 0.4;

/**
 * Book page reader with our OWN page-turn engine.
 *
 * The fold geometry is ported from StPageFlip (see `src/lib/page-fold.ts`)
 * but the gesture layer, animation and rendering are ours — pointer events
 * with x/y axis lock (`touch-action: pan-y` lets vertical drags fall
 * through to page scroll), finger-tracked fold anchored at the corner grab
 * regions, release physics (commit ≥30% progress or flick velocity, else
 * spring back with a slight overshoot), and programmatic turns (keyboard,
 * edge tap zones) reusing the same animation path with a synthetic drag.
 */
export function PageReader({ checkIns, startIndex = 0 }: PageReaderProps) {
  const total = checkIns.length;
  const clampedStart = total > 0 ? Math.min(Math.max(0, startIndex), total - 1) : 0;

  const [index, setIndex] = useState(clampedStart);
  const containerRef = useRef<HTMLDivElement>(null);
  const turnRef = useRef<PageTurnHandle>(null);

  const indexRef = useRef(index);
  const totalRef = useRef(total);
  useEffect(() => {
    indexRef.current = index;
    totalRef.current = total;
  }, [index, total]);

  // Keep the index valid when the page set shrinks.
  useEffect(() => {
    if (indexRef.current > total - 1) setIndex(Math.max(0, total - 1));
  }, [total]);

  // Paper crinkle on turn commit (user gesture → AudioContext resume ok).
  const lastCrunched = useRef(-1);
  useEffect(() => {
    if (index !== lastCrunched.current) {
      if (lastCrunched.current !== -1) playPaperCrackle(1);
      lastCrunched.current = index;
    }
  }, [index]);

  const goNext = useCallback(() => {
    if (indexRef.current < totalRef.current - 1) turnRef.current?.flip('next');
  }, []);
  const goPrev = useCallback(() => {
    if (indexRef.current > 0) turnRef.current?.flip('prev');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  // --- Gesture layer (ours, proven): pointerdown → axis lock → fold -------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    interface Drag {
      id: number;
      startX: number;
      startY: number;
      startT: number;
      lastX: number;
      lastY: number;
      lastT: number;
      axis: null | 'x' | 'y';
      direction: FoldDirection | null;
    }
    let drag: Drag | null = null;

    const localPoint = (e: PointerEvent) => {
      const r = container.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const logGesture = (type: string, dx: number, dt: number, extra?: Record<string, number>) => {
      const w = window as typeof window & {
        __swipeEvents?: { type: string; dx: number; dt: number; progress?: number; vx?: number }[];
      };
      w.__swipeEvents ??= [];
      w.__swipeEvents.push({ type, dx: Math.round(dx), dt: Math.round(dt), ...extra });
    };

    // While an x-axis page-turn drag is active, cancel the browser's
    // touch scrolling (pull-to-refresh / overscroll) — the listener MUST
    // be non-passive for preventDefault to be honored.
    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable && drag?.axis === 'x') e.preventDefault();
    };

    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };

    const startTurnDrag = (d: Drag, e: PointerEvent) => {
      const turn = turnRef.current;
      if (!turn) return;
      const p = localPoint(e);
      const startXLocal = p.x - (e.clientX - d.startX); // local x at pointerdown
      // Corner-grab regions: right half → next (right corner lifts left),
      // left half → prev (left page sweeps in). Corner top/bottom by y.
      const direction: FoldDirection = startXLocal > container.clientWidth / 2 ? 'forward' : 'back';
      const corner: FoldCorner = p.y >= container.clientHeight / 2 ? 'bottom' : 'top';
      d.direction = direction;
      turn.startFold(p, direction, corner);
    };

    const onDown = (e: PointerEvent) => {
      if (drag) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startT: performance.now(),
        lastX: e.clientX,
        lastY: e.clientY,
        lastT: performance.now(),
        axis: null,
        direction: null,
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    };

    const onMove = (e: PointerEvent) => {
      const d = drag;
      if (!d || e.pointerId !== d.id) return;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      d.lastT = performance.now();

      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;

      if (d.axis === null) {
        if (Math.abs(dx) < LOCK_EPSILON_PX && Math.abs(dy) < LOCK_EPSILON_PX) return;
        d.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        if (d.axis === 'x') startTurnDrag(d, e);
        // axis 'y' → released to vertical scroll (pan-y); fold never starts.
      }
      if (d.axis !== 'x') return;

      turnRef.current?.foldTo(localPoint(e));
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      const d = drag;
      if (!d || e.pointerId !== d.id) return;
      drag = null;
      detach();
      const turn = turnRef.current;
      if (!turn) return;

      if (d.axis !== 'x' || d.direction === null) {
        logGesture(d.axis === 'y' ? 'vertical-scroll' : 'tap', e.clientX - d.startX, performance.now() - d.startT);
        return; // never started a fold
      }

      const dx = d.lastX - d.startX;
      const dt = Math.max(1, d.lastT - d.startT);
      const vx = dx / dt; // px/ms, signed
      const progress = turn.getProgress() ?? 0;
      const dir = d.direction;

      if (cancelled) {
        turn.endFold(false);
        logGesture('cancel', dx, dt);
        return;
      }

      // Fast flick: commit if it points the right way and the turn is legal.
      const flick = Math.abs(dx) > 40 && Math.abs(vx) > COMMIT_VELOCITY;
      const towardCommit = dir === 'forward' ? vx < 0 : vx > 0;
      const legal =
        dir === 'forward' ? indexRef.current < totalRef.current - 1 : indexRef.current > 0;

      const commit = legal && !cancelled && (flick ? towardCommit : progress >= COMMIT_PROGRESS || (towardCommit && Math.abs(vx) > COMMIT_VELOCITY));
      turn.endFold(commit);
      logGesture(`${commit ? 'commit' : 'spring-back'}-${dir}`, dx, dt, { progress: Math.round(progress), vx: Number(vx.toFixed(3)) });
    };

    const onUp = (e: PointerEvent) => finish(e, false);
    const onCancel = (e: PointerEvent) => finish(e, true);

    container.addEventListener('pointerdown', onDown);
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('touchmove', onTouchMove);
      detach();
    };
  }, []);

  if (total === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-amber-950 text-center">
        <div className="max-w-sm px-8">
          <span className="text-6xl">📖</span>
          <h2 className="mt-4 font-serif text-xl text-amber-100">This book is empty</h2>
          <p className="mt-2 text-sm text-amber-200/70">
            No check-ins yet. Pour something good and write the first page!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
      className="relative h-full w-full overflow-hidden bg-stone-900"
    >
      <PageTurn ref={turnRef} index={index} onIndexChange={setIndex}>
        {checkIns.map((checkIn) => (
          <BeerPage key={checkIn.id} checkIn={checkIn} />
        ))}
      </PageTurn>

      {/* Edge click zones — pointer devices only (hover-capable). On touch
          they'd cover the drag surface and swallow swipe-back gestures. */}
      {index > 0 && (
        <button
          type="button"
          aria-label="Previous page"
          className="pointer-events-none absolute inset-y-0 left-0 z-50 w-12 cursor-w-resize opacity-0 [@media(hover:hover)]:pointer-events-auto"
          onClick={goPrev}
        />
      )}
      {index < total - 1 && (
        <button
          type="button"
          aria-label="Next page"
          className="pointer-events-none absolute inset-y-0 right-0 z-50 w-12 cursor-e-resize opacity-0 [@media(hover:hover)]:pointer-events-auto"
          onClick={goNext}
        />
      )}

      {/* Progress dots / counter */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-50 flex items-center justify-center gap-1.5">
        {total <= 12 ? (
          checkIns.map((c, i) => (
            <span
              key={c.id}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === index ? 'w-5 bg-amber-400' : 'w-1.5 bg-white/40',
              )}
            />
          ))
        ) : (
          <span className="rounded-full bg-black/50 px-3 py-1 text-xs text-amber-100 backdrop-blur-sm">
            {index + 1} / {total}
          </span>
        )}
      </div>
    </div>
  );
}
