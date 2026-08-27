import { useCallback, useEffect, useRef, useState } from 'react';
import { BeerPage } from '@/components/BeerPage';
import { PageTurn, type PageTurnHandle } from '@/components/PageTurn';
import { PullToRefreshIndicator, type PullIndicatorHandle } from '@/components/PullToRefreshIndicator';
import { useReaderGestures } from '@/hooks/useReaderGestures';
import type { BeerCheckIn } from '@/lib/beerbook';
import { playPaperCrackle } from '@/lib/paper-crackle';
import { cn } from '@/lib/utils';

interface PageReaderProps {
  checkIns: BeerCheckIn[];
  startIndex?: number;
  /** Called when a deliberate pull-to-refresh arms and releases.
   *  The indicator spins until the returned promise settles. */
  onRefresh?: () => Promise<unknown>;
}

/**
 * Book page reader with our OWN page-turn engine (see
 * `hooks/useReaderGestures` for the gesture layer: x/y axis lock with
 * finger-tracked folds, plus a custom pull-to-refresh on the y branch so
 * the reader can refresh WITHOUT resurrecting the browser's native
 * pull-to-refresh — which previously fought the horizontal page turns).
 *
 * The current page is preserved across a feed refresh by check-in id (or
 * clamped if the page disappeared).
 */
export function PageReader({ checkIns, startIndex = 0, onRefresh }: PageReaderProps) {
  const total = checkIns.length;
  const clampedStart = total > 0 ? Math.min(Math.max(0, startIndex), total - 1) : 0;

  const [index, setIndex] = useState(clampedStart);
  const containerRef = useRef<HTMLDivElement>(null);
  const turnRef = useRef<PageTurnHandle>(null);
  const indicatorRef = useRef<PullIndicatorHandle>(null);

  const indexRef = useRef(index);
  const totalRef = useRef(total);
  useEffect(() => {
    indexRef.current = index;
    totalRef.current = total;
  }, [index, total]);

  // Stay on the SAME PAGE (by check-in id) across a feed refresh: new pages
  // landing in front shift the array, so re-resolve the index. If the page
  // vanished (deleted), clamp to the nearest surviving page. This effect
  // must run BEFORE the lastId update below (declaration order = run order).
  const lastIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prevId = lastIdRef.current;
    if (prevId === undefined) return; // first render
    const j = checkIns.findIndex((c) => c.id === prevId);
    setIndex(j >= 0 ? j : Math.min(indexRef.current, Math.max(0, checkIns.length - 1)));
  }, [checkIns]);
  useEffect(() => {
    lastIdRef.current = checkIns[index]?.id;
  }, [checkIns, index]);

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

  // --- Gesture layer (shared with the e2e harness): axis lock → fold/pull -
  useReaderGestures({
    containerRef,
    turnRef,
    indexRef,
    totalRef,
    indicatorRef,
    onRefresh,
  });

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

      {/* Custom pull-to-refresh indicator — slides in under the top edge. */}
      <PullToRefreshIndicator ref={indicatorRef} />

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
