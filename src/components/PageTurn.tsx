import {
  useCallback,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from 'react';
import {
  bottomClipCss,
  computeFold,
  flapClipCss,
  flapTranslate,
  innerShadowStyle,
  outerShadowStyle,
  type FoldCorner,
  type FoldDirection,
  type FoldResult,
} from '@/lib/page-fold';

/**
 * Own DOM+CSS page-turn renderer for the Beerbook reader (portrait,
 * single page, full-bleed).
 *
 * Rendering model is ported from StPageFlip's HTML mode (MIT):
 * - 'forward': current page stays static; the NEXT page is revealed beneath
 *   clipped by the fold's bottom clip area; a cloned copy of the CURRENT
 *   page is the lifted flap (translate + rotate + clip-path); two rotated
 *   gradient divs provide the inner/outer shadows.
 * - 'back': the PREVIOUS page is revealed beneath (mirrored clip); a
 *   blank-paper flap sweeps in from the left using the mirrored transform,
 *   landing to show the previous page.
 *
 * Everything in the pointermove hot path is imperative (refs + inline
 * styles). React only renders the page stack; the flap clone and shadow
 * divs are created/destroyed imperatively at fold start/end.
 */

export interface PageTurnHandle {
  /** Programmatic animated turn (keyboard / edge buttons / fast flick). */
  flip(direction: 'next' | 'prev'): void;
  /** Begin a finger-tracked fold. Returns false if the turn is impossible
   *  (first/last page) or another fold is animating. */
  startFold(point: { x: number; y: number }, direction: FoldDirection, corner: FoldCorner): boolean;
  /** Track the finger (container coords). No-op if no fold is active. */
  foldTo(point: { x: number; y: number }): void;
  /** Release: animate to a committed turn or spring back to the corner. */
  endFold(commit: boolean): void;
  /** Live fold progress (0..100), or null when idle. */
  getProgress(): number | null;
  /** True while a fold (drag or animation) is in progress. */
  isBusy(): boolean;
}

interface PageTurnProps {
  /** Page elements, one per check-in (stable keys; content = BeerPage). */
  children: ReactNode[];
  /** Current page index (controlled). */
  index: number;
  /** Fired when an animated turn commits (new index). */
  onIndexChange: (index: number) => void;
}

/** Duration of a full-width programmatic turn (ms) — StPageFlip flippingTime. */
const FLIP_TIME = 650;
/** Minimum initial fold depth (px inside from the rest edge) so the very
 *  start of a drag is clearly visible (perceptual-mapping lesson). */
const MIN_FOLD_DEPTH = 18;

export const PageTurn = forwardRef<PageTurnHandle, PageTurnProps>(function PageTurn(
  { children, index, onIndexChange },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);

  // Live-fold runtime (all refs — never React state).
  interface FoldRuntime {
    direction: FoldDirection;
    corner: FoldCorner;
    width: number;
    height: number;
    /** Fold input y is CLAMPED to this anchor-corner y (top→0, bottom→height)
     *  so mid-page drags produce the full corner fold — only x tracks the
     *  finger. No dead zones at any start y. */
    clampY: number;
    /** Current fold input point in CONTAINER coords (computeFold mirrors
     *  internally for the back direction — do NOT pre-mirror here). */
    point: { x: number; y: number };
    lastFold: FoldResult | null;
    animating: boolean;
    raf: number | null;
    /** 'back' folds render inside this scaleX(-1) layer: the EXACT mirror
     *  of the forward rendering, by construction. Null for 'forward'. */
    mirrorLayer: HTMLDivElement | null;
    flap: HTMLDivElement | null;
    outer: HTMLDivElement | null;
    inner: HTMLDivElement | null;
  }
  const foldRef = useRef<FoldRuntime | null>(null);

  const indexRef = useRef(index);
  const totalRef = useRef(children.length);
  const onChangeRef = useRef(onIndexChange);
  useEffect(() => {
    indexRef.current = index;
    totalRef.current = children.length;
    onChangeRef.current = onIndexChange;
  }, [index, children.length, onIndexChange]);

  // Show only the current page when idle.
  useEffect(() => {
    pageEls.current.forEach((el, i) => {
      if (el) el.style.display = i === index ? 'block' : 'none';
    });
  }, [index, children.length]);

  const stopRaf = useCallback(() => {
    const f = foldRef.current;
    if (f?.raf != null) cancelAnimationFrame(f.raf);
    if (f) f.raf = null;
  }, []);

  const teardown = useCallback(() => {
    const f = foldRef.current;
    if (!f) return;
    stopRaf();
    f.flap?.remove();
    f.outer?.remove();
    f.inner?.remove();
    f.mirrorLayer?.remove();
    const bottom =
      f.direction === 'forward'
        ? pageEls.current[indexRef.current + 1]
        : pageEls.current[indexRef.current - 1];
    if (bottom) {
      bottom.style.display = 'none';
      bottom.style.clipPath = '';
      bottom.style.zIndex = '';
    }
    foldRef.current = null;
    // Restore idle page visibility (committed index may have changed).
    pageEls.current.forEach((el, i) => {
      if (el) el.style.display = i === indexRef.current ? 'block' : 'none';
    });
  }, [stopRaf]);

  /** Imperatively apply one fold frame. */
  const renderFold = useCallback((f: FoldRuntime, fold: FoldResult | null) => {
    if (!fold) return; // degenerate frame (fold closed at the corner) — hold last
    f.lastFold = fold;
    const { width, height, direction } = f;
    // Page revealed BENEATH the flap — where you're heading:
    // forward → next page; back → PREVIOUS page (mirrored clip, since the
    // fold geometry is computed in forward/mirrored space).
    const bottom =
      direction === 'forward'
        ? pageEls.current[indexRef.current + 1]
        : pageEls.current[indexRef.current - 1];
    if (bottom) {
      const clip =
        direction === 'forward' ? bottomClipCss(fold) : bottomClipCss(fold, width);
      bottom.style.display = 'block';
      bottom.style.zIndex = '20';
      if (clip) bottom.style.clipPath = clip;
    }

    if (f.flap) {
      const t = flapTranslate(fold);
      // Same forward transform for BOTH directions: on 'back' the mirror
      // layer flips the whole rendering, so the fold region is the exact
      // horizontal mirror of forward (content stays readable via the
      // flap's inner scaleX(-1) content wrapper).
      f.flap.style.transform = `translate3d(${t.x}px, ${t.y}px, 0) rotate(${fold.angle}rad)`;
      f.flap.style.clipPath = flapClipCss(fold);
    }

    for (const [el, style] of [
      [f.outer, outerShadowStyle(fold, width, height)],
      [f.inner, innerShadowStyle(fold, width, height)],
    ] as const) {
      if (!el) continue;
      el.style.width = `${style.width}px`;
      el.style.height = `${style.height}px`;
      el.style.background = style.gradient;
      el.style.transformOrigin = `${style.transformOrigin.x}px ${style.transformOrigin.y}px`;
      el.style.transform = `translate3d(${style.translate.x}px, ${style.translate.y}px, 0) rotate(${style.rotate}rad)`;
      el.style.clipPath = style.clip;
    }
  }, []);

  const makeShadowDiv = (layer: HTMLElement, className: string): HTMLDivElement => {
    const el = document.createElement('div');
    el.className = className;
    el.style.cssText =
      'position:absolute;left:0;top:0;display:block;pointer-events:none;z-index:40;will-change:transform;';
    layer.appendChild(el);
    return el;
  };

  const beginFold = useCallback(
    (
    direction: FoldDirection,
    corner: FoldCorner,
    rawPoint: { x: number; y: number },
  ): boolean => {
    const root = rootRef.current;
    if (!root) return false;
    const existing = foldRef.current;
    if (existing?.animating) return false;
    if (existing) teardown();

    const width = root.clientWidth;
    const height = root.clientHeight;
    if (width < 20 || height < 20) return false;

    if (direction === 'forward' && indexRef.current >= totalRef.current - 1) return false;
    if (direction === 'back' && indexRef.current <= 0) return false;

    // Keep the initial fold visibly deep enough (no edge-on dead zone).
    // Forward grabs near the RIGHT edge, back near the LEFT edge.
    const p = { ...rawPoint };
    if (direction === 'forward') p.x = Math.min(p.x, width - MIN_FOLD_DEPTH);
    else p.x = Math.max(p.x, MIN_FOLD_DEPTH);
    p.x = Math.max(-width, Math.min(p.x, 2 * width));
    // Anchor the fold to the corner — y never tracks the finger, so drags
    // from ANY height (top-third / middle / bottom-third) produce the same
    // full corner fold. x does the tracking. (1px inside the edge: exactly
    // ON the edge is a degenerate parallel-line fold → computeFold null.)
    const clampY = corner === 'bottom' ? height - 1 : 1;
    p.y = clampY;

    const sourceIndex = direction === 'forward' ? indexRef.current : indexRef.current - 1;
    const sourceEl = pageEls.current[sourceIndex];
    if (!sourceEl) return false;

    // 'back' renders inside a mirrored fold layer → TRUE mirror of forward.
    const layer: HTMLElement = direction === 'back'
      ? (() => {
          const m = document.createElement('div');
          m.style.cssText =
            'position:absolute;inset:0;transform:scaleX(-1);pointer-events:none;z-index:35;';
          root.appendChild(m);
          return m;
        })()
      : root;

    // Flap = BLANK PAPER back face (picture-book semantics): the back of a
    // turning page shows no photo/text — just the cream book paper with the
    // same warm grain as the app background. Both directions; the fold
    // shadows stay (they carry the depth cue). Symmetric surface, so the
    // back direction's mirrored fold layer needs no content counter-flip.
    const flap = document.createElement('div');
    flap.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;display:block;z-index:30;transform-origin:0 0;pointer-events:none;will-change:transform,clip-path;`;
    const paper = document.createElement('div');
    paper.style.cssText =
      'position:absolute;inset:0;display:block;' +
      // book paper (cream, from the Beerbook palette) + warm grain texture
      'background-color:hsl(40 55% 95%);' +
      `background-image:radial-gradient(rgba(180,130,60,0.10) 1px, transparent 1px);` +
      'background-size:24px 24px;';
    flap.appendChild(paper);
    layer.appendChild(flap);

    const outer = makeShadowDiv(layer, 'page-turn-shadow-outer');
    const inner = makeShadowDiv(layer, 'page-turn-shadow-inner');

    const f: FoldRuntime = {
      direction,
      corner,
      width,
      height,
      clampY,
      point: p,
      lastFold: null,
      animating: false,
      raf: null,
      mirrorLayer: direction === 'back' ? (layer as HTMLDivElement) : null,
      flap,
      outer,
      inner,
    };
    foldRef.current = f;

    const fold = computeFold({ x: p.x, y: p.y, width, height, direction, corner });
    // Hide the static source? Forward: current page stays visible beneath the
    // flap (flap covers it), exactly like StPageFlip portrait forward.
    renderFold(f, fold);
    return true;
  },
  [renderFold, teardown]);

  /** Animate the fold input point from its current position to `dest`
   *  (page coords) over `duration` ms. */
  const animateFold = useCallback(
    (
    f: FoldRuntime,
    dest: { x: number; y: number },
    duration: number,
    opts: { overshoot?: boolean; onDone?: () => void },
  ) => {
    stopRaf();
    f.animating = true;
    const from = { ...f.point };
    const start = performance.now();
    // easeOutBack with a small overshoot for spring-backs; near-linear ramp
    // for commits (StPageFlip animates linearly, duration ∝ distance).
    const ease = opts.overshoot
      ? (t: number) => {
          const c1 = 1.2;
          const c3 = c1 + 1;
          return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        }
      : (t: number) => 1 - Math.pow(1 - t, 2); // easeOutQuad — snappy settle

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / Math.max(duration, 1));
      const e = ease(t);
      f.point = {
        x: from.x + (dest.x - from.x) * e,
        y: f.clampY, // corner-anchored: y never tracks, x does the work
      };
      const fold = computeFold({
        x: f.point.x,
        y: f.point.y,
        width: f.width,
        height: f.height,
        direction: f.direction,
        corner: f.corner,
      });
      if (fold) renderFold(f, fold); // hold last frame on degenerate nulls
      if (t < 1) {
        f.raf = requestAnimationFrame(step);
      } else {
        f.raf = null;
        opts.onDone?.();
      }
    };
    f.raf = requestAnimationFrame(step);
  },
  [stopRaf, renderFold]);

/** Destination raw-container point for a committed turn / spring-back,
 *  expressed via page-space semantics (back is mirrored). */
const rawDest = (f: { direction: FoldDirection; width: number }, pageX: number): number =>
  f.direction === 'back' ? f.width - pageX : pageX;

  useImperativeHandle(
    ref,
    (): PageTurnHandle => ({
      flip(direction) {
        const root = rootRef.current;
        if (!root) return;
        const dir: FoldDirection = direction === 'next' ? 'forward' : 'back';
        if (dir === 'forward' && indexRef.current >= totalRef.current - 1) return;
        if (dir === 'back' && indexRef.current <= 0) return;
        const width = root.clientWidth;
        const height = root.clientHeight;
        const corner: FoldCorner = 'bottom';
        // Port of Flip.flip(): start near the far edge, sweep across.
        const margin = height / 10;
        const startY = corner === 'bottom' ? height - margin : margin;
        const startX = dir === 'forward' ? width - margin : margin;
        if (!beginFold(dir, corner, { x: startX, y: startY })) return;
        const f = foldRef.current!;
        const yDest = corner === 'bottom' ? height : 0;
        const destX = rawDest(f, -width); // page-space -width, mirrored for back
        const dist = Math.abs(destX - startX);
        const duration = Math.max(220, Math.min(FLIP_TIME, (dist / (2 * width)) * FLIP_TIME));
        animateFold(f, { x: destX, y: yDest }, duration, {
          onDone: () => {
            const next = dir === 'forward' ? indexRef.current + 1 : indexRef.current - 1;
            teardown();
            onChangeRef.current(next);
          },
        });
      },

      startFold(point, direction, corner) {
        const root = rootRef.current;
        if (!root) return false;
        return beginFold(direction, corner, { x: point.x, y: point.y });
      },

      foldTo(point) {
        const f = foldRef.current;
        if (!f || f.animating) return;
        f.point = { x: point.x, y: f.clampY };
        const fold = computeFold({
          x: f.point.x,
          y: f.point.y,
          width: f.width,
          height: f.height,
          direction: f.direction,
          corner: f.corner,
        });
        renderFold(f, fold);
      },

      endFold(commit) {
        const f = foldRef.current;
        if (!f) return;
        if (f.animating) return;
        const yDest = f.corner === 'bottom' ? f.height : 0;
        if (commit) {
          animateFold(f, { x: rawDest(f, -f.width), y: yDest }, FLIP_TIME * 0.62, {
            onDone: () => {
              const next =
                f.direction === 'forward' ? indexRef.current + 1 : indexRef.current - 1;
              teardown();
              onChangeRef.current(next);
            },
          });
        } else {
          // Spring back to the resting corner (slight overshoot).
          const rest = { x: rawDest(f, f.width - 1), y: f.corner === 'bottom' ? f.height - 1 : 1 };
          animateFold(f, rest, 380, {
            overshoot: true,
            onDone: () => teardown(),
          });
        }
      },

      getProgress() {
        return foldRef.current?.lastFold?.progress ?? null;
      },

      isBusy() {
        return foldRef.current !== null;
      },
    }),
    [beginFold, animateFold, renderFold, teardown],
  );

  // Safety: tear down on unmount.
  useEffect(() => () => teardown(), [teardown]);

  return (
    <div ref={rootRef} className="absolute inset-0">
      {children.map((child, i) => (
        <div
          key={i}
          ref={(el) => {
            pageEls.current[i] = el;
          }}
          data-page-index={i}
          className="absolute inset-0"
          style={{ display: 'none', zIndex: 10 }}
        >
          {child}
        </div>
      ))}
    </div>
  );
});
