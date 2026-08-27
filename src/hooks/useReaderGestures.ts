import { useEffect, useRef, type RefObject } from 'react';
import type { PageTurnHandle } from '@/components/PageTurn';
import type { PullIndicatorHandle } from '@/components/PullToRefreshIndicator';
import { isPullArmed, pullDistance } from '@/lib/pull-refresh';
import type { FoldCorner, FoldDirection } from '@/lib/page-fold';

/** Axis-lock dead zone (px) before a gesture is treated as a turn/pull. */
export const LOCK_EPSILON_PX = 8;
/** Commit when the fold has progressed this far (%, out of 100). */
export const COMMIT_PROGRESS = 30;
/** Or when released with this velocity toward the turn (px/ms). */
export const COMMIT_VELOCITY = 0.4;

export interface ReaderGesturesArgs {
  containerRef: RefObject<HTMLDivElement | null>;
  turnRef: RefObject<PageTurnHandle | null>;
  /** Live page index (kept in a ref so the listener never rebinds). */
  indexRef: RefObject<number>;
  /** Live page total. */
  totalRef: RefObject<number>;
  /** Pull-to-refresh indicator (required when onRefresh is provided). */
  indicatorRef?: RefObject<PullIndicatorHandle | null>;
  /** Feed refresh; the indicator spins until it settles. */
  onRefresh?: () => Promise<unknown>;
}

/**
 * The reader gesture layer — pointerdown → x/y axis lock → fold OR pull.
 *
 * - axis 'x': finger-tracked page fold (PageTurn), commit ≥30% progress or
 *   flick velocity, else spring back. touchmove is preventDefault'd while
 *   active so no browser overscroll/pull-to-refresh can race the turn.
 * - axis 'y', finger moving DOWN, turn idle, at scroll top: CUSTOM
 *   pull-to-refresh. The indicator tracks the finger at 0.5x resistance;
 *   releasing at/above the arm threshold (see lib/pull-refresh) spins and
 *   awaits `onRefresh`, below threshold it springs back. Upward drags and
 *   drags during an active fold are ignored (fall through as scroll/tap).
 *
 * The axis lock is one-way: a gesture resolves to exactly ONE behavior —
 * a pull that sweeps sideways stays a pull (x never enters), a swipe that
 * starts downward-then-sideways before the lock still locks to whichever
 * axis dominates at the 8px epsilon.
 *
 * Instrumentation for the e2e harness: `window.__swipeEvents` (gesture
 * log incl. `pull-start` / `pull-spring-back` / `refresh`), `__pdCount`
 * (preventDefault count), `__pullState` (live pull snapshot), and
 * `__pullRefreshes` (started refresh count).
 */
export function useReaderGestures({
  containerRef,
  turnRef,
  indexRef,
  totalRef,
  indicatorRef,
  onRefresh,
}: ReaderGesturesArgs): void {
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
      lastX: number;
      lastY: number;
      lastT: number;
      axis: null | 'x' | 'y';
      direction: FoldDirection | null;
      /** True once the gesture resolved to a downward pull-to-refresh. */
      pull: boolean;
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

    const setPullState = (patch: Record<string, unknown>) => {
      const w = window as typeof window & { __pullState?: Record<string, unknown> };
      w.__pullState = { ...(w.__pullState ?? {}), ...patch };
    };

    // While an x-axis page-turn drag or an active pull is in progress,
    // cancel the browser's touch scrolling / overscroll — the listener
    // MUST be non-passive for preventDefault to be honored.
    const onTouchMove = (e: TouchEvent) => {
      if (!e.cancelable || !drag) return;
      if (drag.axis === 'x' || drag.pull) {
        e.preventDefault();
        const w = window as typeof window & { __pdCount?: number };
        w.__pdCount = (w.__pdCount ?? 0) + 1;
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
        pull: false,
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
        // axis 'y' + downward + no fold in flight + at scroll top → pull.
        else if (
          dy > 0 &&
          !turnRef.current?.isBusy() &&
          container.scrollTop <= 0 &&
          refreshRef.current &&
          indicatorRef?.current
        ) {
          d.pull = true;
          logGesture('pull-start', dx, 0, { dy: Math.round(dy) });
        }
      }

      if (d.pull) {
        indicatorRef?.current?.setPull(dy);
        setPullState({
          rawDy: Math.round(dy),
          dist: Math.round(pullDistance(dy)),
          armed: isPullArmed(dy),
          refreshing: false,
        });
        return;
      }

      if (d.axis !== 'x') return; // plain vertical scroll / tap

      turnRef.current?.foldTo(localPoint(e));
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      const d = drag;
      if (!d || e.pointerId !== d.id) return;
      drag = null;
      detach();
      const turn = turnRef.current;

      // ---- pull-to-refresh resolution ----
      if (d.pull) {
        const indicator = indicatorRef?.current;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- binds once, like the original layer
  }, []);
}
