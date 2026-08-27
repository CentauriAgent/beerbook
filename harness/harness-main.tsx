/* eslint-disable react-refresh/only-export-components -- harness entry, not HMR-relevant */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PageTurn, type PageTurnHandle } from '@/components/PageTurn';
import { PullToRefreshIndicator, type PullIndicatorHandle } from '@/components/PullToRefreshIndicator';
import { useReaderGestures } from '@/hooks/useReaderGestures';
import type { FoldCorner, FoldDirection } from '@/lib/page-fold';

const COLORS = ['#7f1d1d', '#14532d', '#1e3a8a', '#713f12', '#4a044e'];
const PAGES = COLORS.map((c, i) => ({ id: `p${i}`, color: c, n: i + 1 }));
const TOTAL = PAGES.length;

/** Simulated feed refresh: resolves after ~500ms so e2e can observe the
 *  spinner mid-refresh and the settle afterwards. */
const harnessRefresh = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 500);
  });

/** Runs the REAL PageReader gesture layer (the very same hook — zero
 *  mirroring drift): axis lock, folds, and the custom pull-to-refresh. */
function Harness() {
  const [index, setIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const turnRef = useRef<PageTurnHandle>(null);
  const indicatorRef = useRef<PullIndicatorHandle>(null);
  const indexRef = useRef(index);
  const totalRef = useRef(TOTAL);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const goNext = useCallback(() => {
    if (indexRef.current < TOTAL - 1) turnRef.current?.flip('next');
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

  // THE production gesture layer (axis lock → fold | pull-to-refresh).
  useReaderGestures({
    containerRef,
    turnRef,
    indexRef,
    totalRef,
    indicatorRef,
    onRefresh: harnessRefresh,
  });

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
        <PullToRefreshIndicator ref={indicatorRef} />
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
