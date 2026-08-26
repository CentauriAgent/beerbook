import { useCallback, useEffect, useRef, useState } from 'react';
import { BeerPage } from '@/components/BeerPage';
import type { BeerCheckIn } from '@/lib/beerbook';
import { cn } from '@/lib/utils';

const TURN_THRESHOLD = 0.25; // fraction of width
const VELOCITY_THRESHOLD = 0.5; // px/ms

interface PageReaderProps {
  checkIns: BeerCheckIn[];
  startIndex?: number;
}

/**
 * Book page reader with a finger-tracked 3D page curl.
 * - Swipe left/right (or arrow keys, or edge clicks) to turn pages.
 * - The page peels in real time under your finger (CSS perspective + rotateY),
 *   springs back if released below threshold.
 */
export function PageReader({ checkIns, startIndex = 0 }: PageReaderProps) {
  const [index, setIndex] = useState(startIndex);
  const [dragX, setDragX] = useState<number | null>(null); // px, null = not dragging
  const [turning, setTurning] = useState<null | 'next' | 'prev' | 'cancel-next' | 'cancel-prev'>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const locked = useRef<'x' | 'y' | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>>(undefined);

  const total = checkIns.length;
  const width = containerRef.current?.clientWidth ?? 1;
  const progress = total > 0 ? dragX !== null && turning ? dragX / width : 0 : 0;

  const goNext = useCallback(() => {
    if (index < total - 1) {
      setTurning('next');
      timers.current = setTimeout(() => {
        setIndex((i) => i + 1);
        setTurning(null);
      }, 350);
    }
  }, [index, total]);

  const goPrev = useCallback(() => {
    if (index > 0) {
      setTurning('prev');
      timers.current = setTimeout(() => {
        setIndex((i) => i - 1);
        setTurning(null);
      }, 350);
    }
  }, [index]);

  // Keyboard navigation (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  useEffect(() => () => clearTimeout(timers.current), []);

  // Pointer handling
  const onPointerDown = (e: React.PointerEvent) => {
    if (turning) return;
    dragStart.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    locked.current = null;
    setDragX(0);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (!locked.current) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        locked.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (locked.current === 'y') {
        dragStart.current = null;
        setDragX(null);
        return;
      }
    }
    if (locked.current === 'x') setDragX(dx);
  };

  const onPointerUp = () => {
    if (dragX === null || !dragStart.current) {
      setDragX(null);
      return;
    }
    const dt = Math.max(1, performance.now() - dragStart.current.t);
    const velocity = Math.abs(dragX) / dt;
    const w = width || 1;
    dragStart.current = null;

    if (dragX < 0 && index < total - 1) {
      if (-dragX / w > TURN_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
        goNext();
      } else {
        setTurning('cancel-next');
        setTimeout(() => setTurning(null), 250);
      }
    } else if (dragX > 0 && index > 0) {
      if (dragX / w > TURN_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
        goPrev();
      } else {
        setTurning('cancel-prev');
        setTimeout(() => setTurning(null), 250);
      }
    }
    setDragX(null);
  };

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

  const clampedIndex = Math.min(Math.max(0, index), total - 1);
  const current = checkIns[clampedIndex];
  const next = checkIns[clampedIndex + 1];
  const prev = checkIns[clampedIndex - 1];

  // --- Compute transforms ---
  let flipTransform = '';
  let flipTransformClass = '';
  let showFlipPage = false;
  let flipPage: BeerCheckIn | undefined;

  if (dragX !== null && locked.current === 'x') {
    // Real-time finger tracking
    const angle = Math.max(-100, Math.min(100, (dragX / width) * -90));
    if (dragX < 0 && next) {
      // Peeling current page forward (left swipe → next)
      showFlipPage = true;
      flipPage = current;
      flipTransform = `rotateY(${Math.min(0, angle) * 0.9}deg)`;
      flipTransformClass = 'origin-left';
    } else if (dragX > 0 && prev) {
      // Prev page peeling back in (right swipe → previous)
      showFlipPage = true;
      flipPage = prev;
      const t = Math.max(0, Math.min(1, dragX / width));
      flipTransform = `rotateY(${(1 - t) * -90}deg)`;
      flipTransformClass = 'origin-left';
    }
  } else if (turning === 'next' || turning === 'cancel-next') {
    showFlipPage = true;
    flipPage = current;
    flipTransformClass = 'origin-left transition-transform duration-300 ease-out';
    flipTransform = turning === 'next' ? 'rotateY(-95deg)' : 'rotateY(0deg)';
  } else if (turning === 'prev' || turning === 'cancel-prev') {
    showFlipPage = true;
    flipPage = prev;
    flipTransformClass = 'origin-left transition-transform duration-300 ease-out';
    flipTransform = turning === 'prev' ? 'rotateY(0deg)' : 'rotateY(-90deg)';
  }

  // Base layer underneath during a forward flip shows next page; otherwise current.
  const basePage = (turning === 'next' || (dragX !== null && dragX < 0)) && next ? next : current;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-stone-900"
      style={{ perspective: '1600px' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Base page (beneath the flipping page) */}
      <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
        <BeerPage checkIn={basePage} />
      </div>

      {/* Flipping page (only visible during drag/animation) */}
      {showFlipPage && flipPage && (
        <div
          className={cn('absolute inset-0', flipTransformClass)}
          style={{
            transform: flipTransform,
            transformStyle: 'preserve-3d',
            backfaceVisibility: 'hidden',
            boxShadow: dragX !== null ? '0 0 40px rgba(0,0,0,0.6)' : undefined,
            zIndex: 10,
          }}
        >
          <BeerPage checkIn={flipPage} />
        </div>
      )}

      {/* Edge click zones (desktop) */}
      {clampedIndex > 0 && (
        <button
          type="button"
          aria-label="Previous page"
          className="absolute inset-y-0 left-0 z-20 w-12 cursor-w-resize opacity-0"
          onClick={goPrev}
        />
      )}
      {clampedIndex < total - 1 && (
        <button
          type="button"
          aria-label="Next page"
          className="absolute inset-y-0 right-0 z-20 w-12 cursor-e-resize opacity-0"
          onClick={goNext}
        />
      )}

      {/* Progress dots */}
      <div className="absolute inset-x-0 bottom-3 z-30 flex items-center justify-center gap-1.5">
        {total <= 12 ? (
          checkIns.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === clampedIndex ? 'w-5 bg-amber-400' : 'w-1.5 bg-white/40',
              )}
            />
          ))
        ) : (
          <span className="rounded-full bg-black/50 px-3 py-1 text-xs text-amber-100 backdrop-blur-sm">
            {clampedIndex + 1} / {total}
          </span>
        )}
      </div>

      {/* Hint progress indicator while dragging */}
      {dragX !== null && locked.current === 'x' && (
        <div className="absolute inset-x-0 top-0 z-30 h-0.5 bg-white/10">
          <div
            className="h-full bg-amber-400 transition-none"
            style={{ width: `${Math.min(100, Math.abs(progress) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
