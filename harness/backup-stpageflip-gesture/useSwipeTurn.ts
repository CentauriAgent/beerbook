/**
 * BACKUP (Aug 26, 2026) — gesture layer for StPageFlip (see usePageFlip.ts
 * backup note). Deleted by concurrent work; restore alongside.
 */
import { useEffect, useRef, type RefObject } from 'react';
import type { PageFlip } from 'page-flip';

/** Fast-swipe commit thresholds. */
const SWIPE_DIST_PX = 40;
const SWIPE_MS = 400;
const SWIPE_VELOCITY = 0.4; // px/ms
/** Matches the library's own "start folding" dead-zone. */
const MOVE_EPSILON_PX = 5;
/** Slow-drag commit threshold (fraction of page width). */
const COMMIT_FRACTION = 0.3;

/** StPageFlip's public drag API exists at runtime but isn't declared in
 * its bundled .d.ts — these are the exact methods its UI layer calls. */
export interface DraggablePageFlip extends PageFlip {
  startUserTouch: (pos: { x: number; y: number }) => void;
  userMove: (pos: { x: number; y: number }, isSoft: boolean) => void;
  userStop: (pos: { x: number; y: number }, isStopped: boolean) => void;
}

export interface UseSwipeTurnParams {
  /** The flipbook container (the library's `.stf__parent` block). */
  containerRef: RefObject<HTMLDivElement | null>;
  /** From usePageFlip — changes when the flipbook re-initializes. */
  instanceId: number;
  /** Live PageFlip instance accessor (library drag API lives on it). */
  getFlip: () => DraggablePageFlip | null;
  flipNext: () => void;
  flipPrev: () => void;
  canNext: () => boolean;
  canPrev: () => boolean;
}

export function useSwipeTurn({
  containerRef,
  instanceId,
  getFlip,
  flipNext,
  flipPrev,
  canNext,
  canPrev,
}: UseSwipeTurnParams): void {
  const p = useRef({ getFlip, flipNext, flipPrev, canNext, canPrev });
  useEffect(() => {
    p.current = { getFlip, flipNext, flipPrev, canNext, canPrev };
  }, [getFlip, flipNext, flipPrev, canNext, canPrev]);

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
      moved: boolean;
    }
    let drag: Drag | null = null;

    const bookPoint = (x: number, y: number): { x: number; y: number } => {
      const block = container.querySelector<HTMLElement>('.stf__block');
      const rect = (block ?? container).getBoundingClientRect();
      return { x: x - rect.left, y: y - rect.top };
    };

    const logGesture = (type: string, dx: number, dt: number) => {
      const w = window as typeof window & {
        __swipeEvents?: { type: string; dx: number; dt: number }[];
      };
      w.__swipeEvents ??= [];
      w.__swipeEvents.push({ type, dx: Math.round(dx), dt: Math.round(dt) });
    };

    const detachWindow = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };

    const onDown = (e: PointerEvent) => {
      if (drag) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const flip = p.current.getFlip() as DraggablePageFlip | null;
      if (!flip) return;
      drag = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startT: performance.now(),
        lastX: e.clientX,
        lastY: e.clientY,
        moved: false,
      };
      flip.startUserTouch(bookPoint(e.clientX, e.clientY));
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    };

    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      if (
        Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > MOVE_EPSILON_PX
      ) {
        drag.moved = true;
      }
      p.current.getFlip()?.userMove(bookPoint(e.clientX, e.clientY), true);
    };

    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { startX, startY, startT, lastX, lastY, moved } = drag;
      drag = null;
      detachWindow();
      const flip = p.current.getFlip() as DraggablePageFlip | null;
      if (!flip) return;

      const dx = lastX - startX;
      const dy = lastY - startY;
      const dt = performance.now() - startT;
      const end = bookPoint(lastX, lastY);
      const fast =
        Math.abs(dx) > SWIPE_DIST_PX &&
        Math.abs(dx) > Math.abs(dy) && // dominant-x
        (dt < SWIPE_MS || Math.abs(dx) / Math.max(dt, 1) > SWIPE_VELOCITY);

      if (fast) {
        logGesture('fast-swipe', dx, dt);
        // Library's own order on swipe: programmatic flip first (it finishes
        // any in-progress fold animation), then userStop(stopped=true) which
        // only resets the touch flag — no double animation.
        if (dx < 0 && p.current.canNext()) {
          p.current.flipNext();
          flip.userStop(end, true);
        } else if (dx > 0 && p.current.canPrev()) {
          p.current.flipPrev();
          flip.userStop(end, true);
        } else {
          // At book bounds: snap the fold back so the gesture still responds.
          flip.userStop(end, moved);
        }
        return;
      }

      logGesture(moved ? 'slow-drag' : 'tap', dx, dt);
      if (!moved) {
        // Tap → library flip() — gated by disableFlipByClick (inert).
        flip.userStop(end, false);
        return;
      }
      // Slow drag: commit when the page was dragged >30% across (the
      // library's own stopMove only commits at ~100%, which feels dead on
      // a phone). Past threshold → programmatic flip (proven path); below →
      // library snap-back animation (still visibly responsive).
      const pageWidth = Math.max(container.clientWidth, 1);
      const frac = Math.abs(dx) / pageWidth;
      if (frac > COMMIT_FRACTION) {
        if (dx < 0 && p.current.canNext()) {
          p.current.flipNext();
          flip.userStop(end, true);
        } else if (dx > 0 && p.current.canPrev()) {
          p.current.flipPrev();
          flip.userStop(end, true);
        } else {
          flip.userStop(end, moved);
        }
        return;
      }
      flip.userStop(end, false); // animate the fold back; threshold not met
    };

    const onCancel = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { lastX, lastY, moved } = drag;
      drag = null;
      detachWindow();
      // Animate any in-progress fold back rather than leaving it frozen.
      p.current.getFlip()?.userStop(bookPoint(lastX, lastY), moved);
    };

    container.addEventListener('pointerdown', onDown);
    return () => {
      container.removeEventListener('pointerdown', onDown);
      detachWindow();
    };
  }, [containerRef, instanceId]);
}
