/* eslint-disable react-refresh/only-export-components -- harness entry, not HMR-relevant */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PageTurn, type PageTurnHandle } from '@/components/PageTurn';
import type { FoldCorner, FoldDirection } from '@/lib/page-fold';

const COLORS = ['#7f1d1d', '#14532d', '#1e3a8a', '#713f12', '#4a044e'];
const PAGES = COLORS.map((c, i) => ({ id: `p${i}`, color: c, n: i + 1 }));
const TOTAL = PAGES.length;

/** Axis-lock dead zone (px) before a gesture is treated as a turn. */
const LOCK_EPSILON_PX = 8;
/** Commit when the fold has progressed this far (%, out of 100). */
const COMMIT_PROGRESS = 30;
/** Or when released with this velocity toward the turn (px/ms). */
const COMMIT_VELOCITY = 0.4;

/** Mirrors PageReader's PageTurn gesture wiring 1:1 (same constants, same
 * handlers, same __swipeEvents instrumentation). */
function Harness() {
  const [index, setIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const turnRef = useRef<PageTurnHandle>(null);
  const indexRef = useRef(index);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  

  const goNext = useCallback(() => {
    if (indexRef.current < PAGES.length - 1) turnRef.current?.flip('next');
  }, []);
  const goPrev = useCallback(() => {
    if (indexRef.current > 0) turnRef.current?.flip('prev');
  }, []);

  // E2E probe + debug hooks
  useEffect(() => {
    (window as unknown as { __probe: object }).__probe = {
      progress: () => turnRef.current?.getProgress() ?? null,
      busy: () => turnRef.current?.isBusy() ?? false,
      start: (x: number, y: number, dir: FoldDirection, corner: FoldCorner) =>
        turnRef.current?.startFold({ x, y }, dir, corner) ?? false,
      to: (x: number, y: number) => turnRef.current?.foldTo({ x, y }),
      end: (commit: boolean) => turnRef.current?.endFold(commit),
      foldDom: () => {
        const root = document.querySelector('[data-page-index]')?.parentElement as HTMLElement | null;
        if (!root) return null;
        const describe = (el: Element | null) => {
          if (!el) return null;
          const s = (el as HTMLElement).style;
          return { cls: el.className, transform: s.transform, clip: s.clipPath?.slice(0, 220), w: s.width, h: s.height };
        };
        const kids = [...root.children].map((c) => describe(c));
        return kids;
      },
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

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

    const logGesture = (type: string, dx: number, dt: number) => {
      const w = window as typeof window & {
        __swipeEvents?: { type: string; dx: number; dt: number }[];
      };
      w.__swipeEvents ??= [];
      w.__swipeEvents.push({ type, dx: Math.round(dx), dt: Math.round(dt) });
    };

    // Non-passive touchmove: cancel browser pull-to-refresh/overscroll
    // while an x-axis page-turn drag is active (mirrors PageReader 1:1).
    // __pdCount is an e2e probe: how many times we claimed the gesture.
    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable && drag?.axis === 'x') {
        e.preventDefault();
        (window as unknown as { __pdCount?: number }).__pdCount = ((window as unknown as { __pdCount?: number }).__pdCount ?? 0) + 1;
      }
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
      const startXLocal = p.x - (e.clientX - d.startX);
      const direction: FoldDirection = startXLocal > container.clientWidth / 2 ? 'forward' : 'back';
      const corner: FoldCorner = p.y >= container.clientHeight / 2 ? 'bottom' : 'top';
      d.direction = direction;
      (window as unknown as { __dir?: string }).__dir = direction + '@' + startXLocal.toFixed(0);
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
        return;
      }

      const dx = d.lastX - d.startX;
      const dt = Math.max(1, d.lastT - d.startT);
      const vx = dx / dt;
      const progress = turn.getProgress() ?? 0;
      const dir = d.direction;

      if (cancelled) {
        turn.endFold(false);
        logGesture('cancel', dx, dt);
        return;
      }

      const flick = Math.abs(dx) > 40 && Math.abs(vx) > COMMIT_VELOCITY;
      const towardCommit = dir === 'forward' ? vx < 0 : vx > 0;
      const legal =
        dir === 'forward' ? indexRef.current < TOTAL - 1 : indexRef.current > 0;

      const commit = legal && !cancelled && (flick ? towardCommit : progress >= COMMIT_PROGRESS || (towardCommit && Math.abs(vx) > COMMIT_VELOCITY));
      turn.endFold(commit);
      logGesture(`${commit ? 'commit' : 'spring-back'}-${dir}`, dx, dt);
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

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#1c1917' }}>
      {/* Mirrors production: touch zones never cover the gesture surface. */}
      <style>{`
        #prev-btn,#next-btn{pointer-events:none}@media(hover:hover){#prev-btn,#next-btn{pointer-events:auto}}
        /* The harness build has no Tailwind: force the PageTurn layout that
           production gets from the absolute inset-0 classes. */
        #root div:has(> [data-page-index]){position:absolute;inset:0}
        #root [data-page-index]{position:absolute;inset:0}
        html,body{overscroll-behavior:contain}
      `}</style>
      <div
        ref={containerRef}
        style={{ touchAction: 'pan-y', overscrollBehavior: 'contain', position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
      >
        <PageTurn ref={turnRef} index={index} onIndexChange={setIndex}>
          {PAGES.map((p) => (
            <div
              key={p.id}
              style={{ background: p.color, width: '100%', height: '100%' }}
            >
              <div style={{ fontSize: 96, color: 'white', textAlign: 'center', paddingTop: '40%' }}>
                PAGE {p.n}
              </div>
            </div>
          ))}
        </PageTurn>
      </div>
      <button
        id="prev-btn"
        onClick={goPrev}
        style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: 60, opacity: 0 }}
        aria-label="Previous page"
      />
      <button
        id="next-btn"
        onClick={goNext}
        style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 60, opacity: 0 }}
        aria-label="Next page"
      />
      <div id="index-display" style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', color: 'white' }}>
        index: {index}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
