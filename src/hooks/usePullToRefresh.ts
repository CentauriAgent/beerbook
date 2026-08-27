import { useEffect, useRef, type RefObject } from 'react';
import { isPullArmed, pullDistance } from '@/lib/pull-refresh';
import type { PullIndicatorHandle } from '@/components/PullToRefreshIndicator';

/** Axis-lock dead zone (px) before a gesture resolves; matches reader. */
const LOCK_EPSILON_PX = 8;

export interface UsePullToRefreshArgs {
  /** Refresh callback; the indicator spins until the promise settles. */
  onRefresh?: () => Promise<unknown>;
}

export interface PullToRefreshHandle {
  /** Container element the gesture binds to (wrap the page surface). */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Indicator ref — render `<PullToRefreshIndicator ref={indicatorRef} />`. */
  indicatorRef: RefObject<PullIndicatorHandle | null>;
}

/**
 * Reusable pull-to-refresh gesture for scrollable/static surfaces (Profile,
 * BeerDetail, any feed page). Extracted from the PageReader gesture layer so
 * the same rubber-band math (lib/pull-refresh) and instrumentation apply
 * everywhere.
 *
 * Gesture rules:
 * - pointerdown on the container, axis lock (8px epsilon) resolves the
 *   gesture; a downward-dominant move while `window.scrollY` is at the top
 *   becomes a pull; everything else is left alone (tap/scroll pass through).
 * - While the pull is active, a non-passive touchmove preventDefault stops
 *   the browser's own overscroll / native refresh from fighting the custom
 *   indicator.
 * - Release at/above the arm threshold (lib/pull-refresh) → indicator spins
 *   and awaits `onRefresh`; below threshold it springs back.
 *
 * Instrumentation for the e2e harness mirrors the reader layer:
 * `window.__swipeEvents` (`pull-start` / `pull-spring-back` / `pull-cancel` /
 * `refresh`), `__pullState` snapshot, `__pullRefreshes` count, `__pdCount`.
 */
export function usePullToRefresh({ onRefresh }: UsePullToRefreshArgs): PullToRefreshHandle {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<PullIndicatorHandle | null>(null);
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    interface Drag {
      id: number;
      startX: number;
      startY: number;
      startT: number;
      axis: null | 'x' | 'y';
      pull: boolean;
    }
    let drag: Drag | null = null;

    const logGesture = (type: string, dy: number, dt: number, extra?: Record<string, number>) => {
      const w = window as typeof window & {
        __swipeEvents?: { type: string; dx: number; dt: number }[];
      };
      w.__swipeEvents ??= [];
      w.__swipeEvents.push({ type, dx: Math.round(dy), dt: Math.round(dt), ...extra });
    };

    const setPullState = (patch: Record<string, unknown>) => {
      const w = window as typeof window & { __pullState?: Record<string, unknown> };
      w.__pullState = { ...(w.__pullState ?? {}), ...patch };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!e.cancelable || !drag?.pull) return;
      e.preventDefault();
      const w = window as typeof window & { __pdCount?: number };
      w.__pdCount = (w.__pdCount ?? 0) + 1;
    };

    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };

    const onDown = (e: PointerEvent) => {
      if (drag) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startT: performance.now(),
        axis: null,
        pull: false,
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    };

    const onMove = (e: PointerEvent) => {
      const d = drag;
      if (!d || e.pointerId !== d.id) return;

      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;

      if (d.axis === null) {
        if (Math.abs(dx) < LOCK_EPSILON_PX && Math.abs(dy) < LOCK_EPSILON_PX) return;
        d.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        // Downward at scroll top → custom pull; anything else just flows.
        if (d.axis === 'y' && dy > 0 && window.scrollY <= 0 && refreshRef.current) {
          d.pull = true;
          logGesture('pull-start', dy, 0);
        }
      }

      if (d.pull) {
        indicatorRef.current?.setPull(dy);
        setPullState({
          rawDy: Math.round(dy),
          dist: Math.round(pullDistance(dy)),
          armed: isPullArmed(dy),
          refreshing: false,
        });
      }
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      const d = drag;
      if (!d || e.pointerId !== d.id) return;
      drag = null;
      detach();

      if (d.pull) {
        const indicator = indicatorRef.current;
        const dy = e.clientY - d.startY;
        const dt = performance.now() - d.startT;
        const armed = !cancelled && isPullArmed(dy);
        if (armed && indicator) {
          const w = window as typeof window & { __pullRefreshes?: number };
          w.__pullRefreshes = (w.__pullRefreshes ?? 0) + 1;
          logGesture('refresh', dy, dt, { dist: Math.round(pullDistance(dy)) });
          setPullState({ armed: true, refreshing: true });
          indicator.startSpin();
          Promise.resolve(refreshRef.current?.())
            .then(() => {
              indicator.settle();
              setPullState({ refreshing: false, settledAt: performance.now() });
            })
            .catch(() => {
              indicator.reset();
              setPullState({ refreshing: false, failedAt: performance.now() });
            });
        } else {
          logGesture(cancelled ? 'pull-cancel' : 'pull-spring-back', dy, dt, {
            dist: Math.round(pullDistance(dy)),
          });
          setPullState({ armed: false, refreshing: false });
          indicator?.reset();
        }
        return;
      }

      logGesture(d.axis === 'y' ? 'vertical-scroll' : 'tap', e.clientY - d.startY, performance.now() - d.startT);
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

  return { containerRef, indicatorRef };
}
