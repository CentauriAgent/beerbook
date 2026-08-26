/**
 * Pure page-fold math for the Beerbook page-turn.
 *
 * Ported from StPageFlip (`page-flip` npm package, v2.0.7) — MIT License,
 * Copyright (c) 2021 Alexander Rudenko (Nodlik/StPageFlip). Specifically:
 * - `src/Flip/FlipCalculation.ts` (cone/corner fold geometry, clip areas,
 *   progress, shadow start point + shadow angle)
 * - `src/Helper.ts` (point rotation, circle clamping, segment intersection)
 * - `src/Page/HTMLPage.ts` `drawSoft()` (flap clip polygon transform)
 * - `src/Render/HTMLRender.ts` `drawInnerShadow()` / `drawOuterShadow()`
 *   (rotated gradient shadow overlays)
 *
 * All functions are pure (no DOM), so they are unit-testable. Coordinate
 * space: the visible page — origin at its top-left, x → right, y → down,
 * 0..width / 0..height. Because our book is a full-bleed single page,
 * page space == container space.
 *
 * Direction semantics — TRUE MIRROR, single geometry path:
 * - 'forward': the CURRENT page's right corner lifts toward the left; the
 *   flap is a clone of the current page; the NEXT page is revealed beneath
 *   (clipped by the bottom clip area).
 * - 'back': the EXACT horizontal mirror of forward. There are no divergent
 *   'back' geometry branches: `computeFold` mirrors the input x
 *   (x → width − x) and runs the very same forward math. The result is
 *   returned in FORWARD (page) space; the renderer mirrors it back to
 *   container space via a `scaleX(-1)` fold layer + a horizontally mirrored
 *   flap clip (see PageTurn). Both directions are therefore symmetric by
 *   construction: identical fold line, shadows, progress and spring physics.
 *
 * NOTE: the fold input y is expected to be CLAMPED to the anchor corner
 * (top → y=0, bottom → y=height) by the gesture layer, so mid-page drags
 * produce the full corner fold while tracking the finger's x.
 */

export interface Pt {
  x: number;
  y: number;
}

export type FoldDirection = 'forward' | 'back';
export type FoldCorner = 'top' | 'bottom';

export interface RectPoints {
  topLeft: Pt;
  topRight: Pt;
  bottomLeft: Pt;
  bottomRight: Pt;
}

/** Input point is in page/container coords (raw finger position). */
export interface FoldInput {
  x: number;
  y: number;
  width: number;
  height: number;
  direction: FoldDirection;
  corner: FoldCorner;
}

export interface FoldShadow {
  /** Shadow start point (page coords). */
  pos: Pt;
  /** Shadow rotation angle in radians (pre +3π/2 offset). */
  angle: number;
  /** Gradient width in px. */
  width: number;
  /** Gradient opacity 0..maxOpacity. */
  opacity: number;
}

export interface FoldResult {
  direction: FoldDirection;
  corner: FoldCorner;
  /** Rendered rotation for the flap element (radians, forward-space). */
  angle: number;
  /** Flap element translate target (page/forward coords) — the active corner. */
  position: Pt;
  /** Clip polygon for the flap, in flap-local coords (CSS-ready). */
  flapClip: Pt[];
  /** Clip polygon for the page revealed beneath (page coords, forward
   *  space). Used by the renderer for BOTH directions — on 'back' the
   *  PREVIOUS page is revealed beneath the flap (renderer mirrors the
   *  polygon back to container space). May contain nulls
   *  (degenerate edge points). */
  bottomClip: (Pt | null)[] | null;
  /** Fold progress 0..100 (commit threshold ~30). */
  progress: number;
  /** Corners of the rotating (virtual) page rect, page coords. */
  pageRect: RectPoints;
  shadow: FoldShadow;
}

/** Max shadow opacity (was StPageFlip setting `maxShadowOpacity: 0.5`). */
export const MAX_SHADOW_OPACITY = 0.5;

// ---------------------------------------------------------------------------
// Helper functions (ported from Helper.ts)
// ---------------------------------------------------------------------------

/** Port of Helper.GetRotatedPoint. */
export function rotatedPoint(p: Pt, start: Pt, angle: number): Pt {
  return {
    x: p.x * Math.cos(angle) + p.y * Math.sin(angle) + start.x,
    y: p.y * Math.cos(angle) - p.x * Math.sin(angle) + start.y,
  };
}

/** Port of Helper.GetDistanceBetweenTwoPoint (null-safe). */
export function dist(a: Pt | null, b: Pt | null): number {
  if (a === null || b === null) return Infinity;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

interface BoundedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function pointInRect(rect: BoundedRect, p: Pt | null): Pt | null {
  if (p === null) return null;
  if (
    p.x >= rect.left &&
    p.x <= rect.width + rect.left &&
    p.y >= rect.top &&
    p.y <= rect.top + rect.height
  ) {
    return p;
  }
  return null;
}

/** Port of Helper.GetIntersectBeetwenTwoLine. Returns null if parallel. */
function intersectLines(one: [Pt, Pt], two: [Pt, Pt]): Pt | null {
  const A1 = one[0].y - one[1].y;
  const A2 = two[0].y - two[1].y;
  const B1 = one[1].x - one[0].x;
  const B2 = two[1].x - two[0].x;
  const C1 = one[0].x * one[1].y - one[1].x * one[0].y;
  const C2 = two[0].x * two[1].y - two[1].x * two[0].y;

  const det = A1 * B2 - A2 * B1;
  if (Math.abs(det) < 1e-9) return null;

  return {
    x: -((C1 * B2 - C2 * B1) / det),
    y: -((A1 * C2 - A2 * C1) / det),
  };
}

/** Port of Helper.GetIntersectBetweenTwoSegment (line ∩ line, bounded to rect). */
function intersectInRect(rect: BoundedRect, one: [Pt, Pt], two: [Pt, Pt]): Pt | null {
  try {
    return pointInRect(rect, intersectLines(one, two));
  } catch {
    return null;
  }
}

/** Port of Helper.LimitPointToCircle. */
function limitPointToCircle(start: Pt, radius: number, p: Pt): Pt {
  if (dist(start, p) <= radius) return p;

  const a = start.x;
  const b = start.y;
  const n = p.x;
  const m = p.y;

  const denom = (a - n) * (a - n) + (b - m) * (b - m);
  let x = Math.sqrt((radius * radius * (a - n) * (a - n)) / denom) + a;
  if (p.x < 0) x *= -1;

  let y = ((x - a) * (b - m)) / (a - n) + b;
  if (a - n + b === 0) y = radius;

  return { x, y };
}

/** Port of Helper.GetAngleBetweenTwoLine. */
function angleBetweenLines(one: [Pt, Pt], two: [Pt, Pt]): number {
  const A1 = one[0].y - one[1].y;
  const A2 = two[0].y - two[1].y;
  const B1 = one[1].x - one[0].x;
  const B2 = two[1].x - two[0].x;

  return Math.acos(
    (A1 * A2 + B1 * B2) / (Math.sqrt(A1 * A1 + B1 * B1) * Math.sqrt(A2 * A2 + B2 * B2)),
  );
}

/** Port of the per-point transform in HTMLPage.drawSoft(): page-space clip
 *  point → flap-local clip point (relative to the element transform).
 *  Single path for BOTH directions — back geometry IS forward geometry
 *  (only the input x was mirrored), so no direction branch is needed. */
function toFlapLocal(p: Pt, position: Pt, angle: number): Pt {
  const g = { x: p.x - position.x, y: p.y - position.y };
  return rotatedPoint(g, { x: 0, y: 0 }, angle);
}

// ---------------------------------------------------------------------------
// FoldCalculation port
// ---------------------------------------------------------------------------

interface CalcState {
  angle: number;
  position: Pt;
  rect: RectPoints;
  topIntersect: Pt | null;
  sideIntersect: Pt | null;
  bottomIntersect: Pt | null;
}

function calculateAngle(
  pos: Pt,
  corner: FoldCorner,
  pageWidth: number,
  pageHeight: number,
): number {
  const left = pageWidth - pos.x + 1;
  const top = corner === 'bottom' ? pageHeight - pos.y : pos.y;

  let angle = 2 * Math.acos(left / Math.hypot(top, left));
  if (top < 0) angle = -angle;

  const da = Math.PI - angle;
  if (!isFinite(angle) || (da >= 0 && da < 0.003)) throw new Error('The G point is too small');

  if (corner === 'bottom') angle = -angle;

  return angle;
}

function pageRectFor(pos: Pt, angle: number, corner: FoldCorner, pageWidth: number, pageHeight: number): RectPoints {
  const base =
    corner === 'top'
      ? [
          { x: 0, y: 0 },
          { x: pageWidth, y: 0 },
          { x: 0, y: pageHeight },
          { x: pageWidth, y: pageHeight },
        ]
      : [
          { x: 0, y: -pageHeight },
          { x: pageWidth, y: -pageHeight },
          { x: 0, y: 0 },
          { x: pageWidth, y: 0 },
        ];

  const rp = (p: Pt): Pt => rotatedPoint(p, pos, angle);
  return { topLeft: rp(base[0]), topRight: rp(base[1]), bottomLeft: rp(base[2]), bottomRight: rp(base[3]) };
}

function updateAngleAndGeometry(
  s: CalcState,
  pos: Pt,
  corner: FoldCorner,
  pageWidth: number,
  pageHeight: number,
): void {
  s.angle = calculateAngle(pos, corner, pageWidth, pageHeight);
  s.rect = pageRectFor(pos, s.angle, corner, pageWidth, pageHeight);
}

function calcAngleAndPosition(
  rawPos: Pt,
  corner: FoldCorner,
  pageWidth: number,
  pageHeight: number,
): { pos: Pt; s: CalcState } {
  const s = { angle: 0, position: rawPos, rect: null as unknown as RectPoints, topIntersect: null, sideIntersect: null, bottomIntersect: null };
  let result = rawPos;
  updateAngleAndGeometry(s, result, corner, pageWidth, pageHeight);

  // Port of checkPositionAtCenterLine.
  const centerOne = corner === 'top' ? { x: 0, y: 0 } : { x: 0, y: pageHeight };
  const centerTwo = corner === 'top' ? { x: 0, y: pageHeight } : { x: 0, y: 0 };

  const tmp = limitPointToCircle(centerOne, pageWidth, result);
  if (tmp !== result) {
    result = tmp;
    updateAngleAndGeometry(s, result, corner, pageWidth, pageHeight);
  }

  const rad = Math.hypot(pageWidth, pageHeight);
  const [checkOne, checkTwo] =
    corner === 'bottom'
      ? [s.rect.topRight, s.rect.bottomLeft]
      : [s.rect.bottomRight, s.rect.topLeft];

  if (checkOne.x <= 0) {
    const bottomPoint = limitPointToCircle(centerTwo, rad, checkTwo);
    if (bottomPoint !== result) {
      result = bottomPoint;
      updateAngleAndGeometry(s, result, corner, pageWidth, pageHeight);
    }
  }

  if (Math.abs(result.x - pageWidth) < 1 && Math.abs(result.y) < 1) {
    throw new Error('Point is too small');
  }

  s.position = result;
  return { pos: result, s };
}

function calculateIntersectPoints(
  s: CalcState,
  pos: Pt,
  corner: FoldCorner,
  pageWidth: number,
  pageHeight: number,
): void {
  const boundRect: BoundedRect = { left: -1, top: -1, width: pageWidth + 2, height: pageHeight + 2 };
  const topEdge: [Pt, Pt] = [{ x: 0, y: 0 }, { x: pageWidth, y: 0 }];
  const rightEdge: [Pt, Pt] = [{ x: pageWidth, y: 0 }, { x: pageWidth, y: pageHeight }];
  const bottomEdge: [Pt, Pt] = [{ x: 0, y: pageHeight }, { x: pageWidth, y: pageHeight }];

  if (corner === 'top') {
    s.topIntersect = intersectInRect(boundRect, [pos, s.rect.topRight], topEdge);
    s.sideIntersect = intersectInRect(boundRect, [pos, s.rect.bottomLeft], rightEdge);
    s.bottomIntersect = intersectInRect(boundRect, [s.rect.bottomLeft, s.rect.bottomRight], bottomEdge);
  } else {
    s.topIntersect = intersectInRect(boundRect, [s.rect.topLeft, s.rect.topRight], topEdge);
    s.sideIntersect = intersectInRect(boundRect, [pos, s.rect.topLeft], rightEdge);
    s.bottomIntersect = intersectInRect(boundRect, [s.rect.bottomLeft, s.rect.bottomRight], bottomEdge);
  }
}

/**
 * Compute the fold for a finger position. Returns null when the point is in
 * a degenerate configuration (fold closed exactly at the corner) — callers
 * should keep the last rendered frame in that case, exactly like StPageFlip's
 * `calc()` returning false.
 */
export function computeFold(input: FoldInput): FoldResult | null {
  const { width: pageWidth, height: pageHeight, direction, corner } = input;

  // TRUE MIRROR: single geometry path. 'back' mirrors the input x and runs
  // the exact same forward math — no divergent branches anywhere below.
  // The renderer mirrors the output horizontally (see PageTurn's
  // scaleX(-1) fold layer), so back is forward's mirror by construction.
  const inputX = direction === 'back' ? pageWidth - input.x : input.x;

  let pos: Pt;
  let s: CalcState;
  try {
    const r = calcAngleAndPosition({ x: inputX, y: input.y }, corner, pageWidth, pageHeight);
    pos = r.pos;
    s = r.s;
    calculateIntersectPoints(s, pos, corner, pageWidth, pageHeight);
  } catch {
    return null;
  }

  // Port of getFlippingProgress(): measured on the calc position (page
  // space, i.e. mirrored for 'back') — 0% at rest (x = pageWidth) → 100%
  // fully across (x = -pageWidth).
  const progress = Math.abs(((s.position.x - pageWidth) / (2 * pageWidth)) * 100);

  // getFlippingClipArea()
  const flapArea: (Pt | null)[] = [];
  let clipBottom = false;
  flapArea.push(s.rect.topLeft);
  flapArea.push(s.topIntersect);
  if (s.sideIntersect === null) {
    clipBottom = true;
  } else {
    flapArea.push(s.sideIntersect);
    if (s.bottomIntersect === null) clipBottom = false;
  }
  flapArea.push(s.bottomIntersect);
  if (clipBottom || corner === 'bottom') flapArea.push(s.rect.bottomLeft);

  // getBottomClipArea() — computed on the shared forward geometry; the
  // renderer applies it on 'forward' turns only (on 'back' the static
  // current page shows through beneath the mirrored flap).
  const bottomClip: (Pt | null)[] = (() => {
    const area: (Pt | null)[] = [];
    area.push(s.topIntersect);
    if (corner === 'top') {
      area.push({ x: pageWidth, y: 0 });
    } else {
      if (s.topIntersect !== null) area.push({ x: pageWidth, y: 0 });
      area.push({ x: pageWidth, y: pageHeight });
    }
    if (s.sideIntersect !== null) {
      if (dist(s.sideIntersect, s.topIntersect) >= 10) area.push(s.sideIntersect);
    } else {
      if (corner === 'top') area.push({ x: pageWidth, y: pageHeight });
    }
    area.push(s.bottomIntersect);
    area.push(s.topIntersect);
    return area;
  })();

  // getAngle() — forward-space render rotation.
  const renderAngle = -s.angle;

  // getActiveCorner() — flap element anchor. StPageFlip anchors BOTH the
  // element translate and the clip polygon origin at the active corner
  // (rect.topLeft in forward space): HTMLPage.draw() converts
  // state.position (= getActiveCorner()) to global for the translate, and
  // drawSoft() computes the clip relative to the very same point. For the
  // top corner this coincides with the finger pos; for the bottom corner
  // the virtual rect extends a full page height above pos, so the anchor
  // and the clip MUST agree or the clip lands outside the element.
  const activeCorner = s.rect.topLeft;

  // Flap clip polygon in flap-local coords (HTMLPage.drawSoft()).
  const flapClip = flapArea
    .filter((p): p is Pt => p !== null)
    .map((p) => toFlapLocal(p, activeCorner, renderAngle));

  // getFlippingProgress() — from the mirrored input point (see above).

  // Shadow geometry (FlipCalculation.getShadowStartPoint/getShadowAngle +
  // Render.setShadowData).
  let shadowStart: Pt | null;
  if (corner === 'top') {
    shadowStart = s.topIntersect;
  } else {
    shadowStart = s.sideIntersect ?? s.topIntersect;
  }
  // Degenerate shadow geometry (fold edge-on): unrenderable frame.
  if (shadowStart === null) return null;
  const shadowSecond =
    shadowStart !== s.sideIntersect && s.sideIntersect !== null ? s.sideIntersect : s.bottomIntersect;
  if (shadowSecond === null) return null;
  const rawShadowAngle = angleBetweenLines([shadowStart, shadowSecond], [
    { x: 0, y: 0 },
    { x: pageWidth, y: 0 },
  ]);
  // Forward-space shadow angle (the renderer's mirrored fold layer flips
  // it back for 'back', keeping the shadows an exact mirror too).
  const shadowAngle = rawShadowAngle;

  return {
    direction,
    corner,
    angle: renderAngle,
    position: activeCorner,
    flapClip,
    bottomClip,
    progress,
    pageRect: s.rect,
    shadow: {
      pos: shadowStart,
      angle: shadowAngle,
      width: (((pageWidth * 3) / 4) * progress) / 100,
      opacity: ((100 - progress) * (100 * MAX_SHADOW_OPACITY)) / 100 / 100,
    },
  };
}

// ---------------------------------------------------------------------------
// Shadow overlay geometry (ported from HTMLRender.drawInnerShadow /
// drawOuterShadow). Returned values are CSS-ready: apply `translate`,
// `rotate` (radians), `transformOrigin`, `clip` as a clip-path polygon and
// `gradient` as a CSS `background`.
// ---------------------------------------------------------------------------

export interface ShadowStyle {
  width: number;
  height: number;
  translate: Pt;
  rotate: number;
  transformOrigin: Pt;
  clip: string;
  gradient: string;
}

function polygonCss(points: (Pt | null)[]): string {
  return `polygon(${points
    .filter((p): p is Pt => p !== null)
    .map((p) => `${round(p.x)}px ${round(p.y)}px`)
    .join(', ')})`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Container-space x of a page-space point. With the mirror-layer design
 *  the shadow geometry is ALWAYS rendered in forward space inside the
 *  (possibly scaleX(-1)) fold layer — no per-direction conversion. */
function globalShadowPos(fold: FoldResult): Pt {
  return fold.shadow.pos;
}

/** Port of HTMLRender.drawInnerShadow(). */
export function innerShadowStyle(fold: FoldResult, width: number, height: number): ShadowStyle {
  const innerSize = (fold.shadow.width * 3) / 4;
  const shadowTranslate = innerSize;
  const gradientDir = 'to left';
  const angle = fold.shadow.angle + (3 * Math.PI) / 2;
  const pos = globalShadowPos(fold);

  const clip = [
    fold.pageRect.topLeft,
    fold.pageRect.topRight,
    fold.pageRect.bottomRight,
    fold.pageRect.bottomLeft,
  ];
  const poly = clip.map((p) =>
    rotatedPoint({ x: p.x - fold.shadow.pos.x, y: p.y - fold.shadow.pos.y }, { x: shadowTranslate, y: 100 }, angle),
  );

  return {
    width: innerSize,
    height: height * 2,
    translate: { x: pos.x - shadowTranslate, y: pos.y - 100 },
    rotate: angle,
    transformOrigin: { x: shadowTranslate, y: 100 },
    clip: polygonCss(poly),
    gradient: `linear-gradient(${gradientDir}, rgba(0,0,0,${round(fold.shadow.opacity)}) 5%, rgba(0,0,0,0.05) 15%, rgba(0,0,0,${round(fold.shadow.opacity)}) 35%, rgba(0,0,0,0) 100%)`,
  };
}

/** Port of HTMLRender.drawOuterShadow(). */
export function outerShadowStyle(fold: FoldResult, width: number, height: number): ShadowStyle {
  const shadowTranslate = 0;
  const gradientDir = 'to right';
  const angle = fold.shadow.angle + (3 * Math.PI) / 2;
  const pos = globalShadowPos(fold);

  const clip = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const poly = clip.map((p) =>
    rotatedPoint({ x: p.x - fold.shadow.pos.x, y: p.y - fold.shadow.pos.y }, { x: shadowTranslate, y: 100 }, angle),
  );

  return {
    width: fold.shadow.width,
    height: height * 2,
    translate: { x: pos.x - shadowTranslate, y: pos.y - 100 },
    rotate: angle,
    transformOrigin: { x: shadowTranslate, y: 100 },
    clip: polygonCss(poly),
    gradient: `linear-gradient(${gradientDir}, rgba(0,0,0,${round(fold.shadow.opacity)}), rgba(0,0,0,0))`,
  };
}

/** CSS clip-path polygon string for the flap clip (flap-local coords).
 *  Identical for both directions: on 'back' the whole flap element renders
 *  with the exact forward transform INSIDE the renderer's scaleX(-1)
 *  mirror layer, which produces the strict horizontal mirror of the
 *  forward fold region. (The page content inside the flap is counter-
 *  flipped with its own scaleX(-1) so it stays readable.) */
export function flapClipCss(fold: FoldResult): string {
  return polygonCss(fold.flapClip);
}

/** Flap element translate target (fold-layer coords — the mirrored fold
 *  layer for 'back'). Same value for both directions: back IS forward
 *  geometry inside the mirrored layer. */
export function flapTranslate(fold: FoldResult): Pt {
  return fold.position;
}

/** CSS clip-path polygon string for the bottom (revealed) page, page coords.
 *  Optional `mirrorX` (page width) horizontally mirrors the polygon —
 *  needed for 'back' folds: the fold geometry is computed in forward
 *  (mirrored) space, but the revealed page element lives un-mirrored in
 *  the container, so its clip must be converted back to container space. */
export function bottomClipCss(fold: FoldResult, mirrorX?: number): string | null {
  if (!fold.bottomClip) return null;
  const pts = fold.bottomClip.filter((p): p is Pt => p !== null);
  if (mirrorX != null) {
    return polygonCss(pts.map((p) => ({ x: mirrorX - p.x, y: p.y })));
  }
  return polygonCss(pts);
}
