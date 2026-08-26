# StPageFlip fold math (HTML "soft" mode) — technical notes for our own renderer

Source: `node_modules/page-flip/dist/js/page-flip.module.js` (v2.0.7, minified).
Names below are the original class names from the library's TypeScript
(FlipCalculation, HTMLPage, Render, Flip, UI), reconstructed from structure.

Coordinate model:
- **Book space**: origin at the book's top-left (`Rect.left/top` from
  `Render.calculateBoundsRect`). Portrait mode: single page, width =
  `pageWidth`, `height` = book height.
- **Page space** (`Render.convertToPage`): x mirrored for a "back" flip —
  `{x: dir===0 ? x-left-width/2 : width/2-x+left, y: y-top}`. The drag
  geometry is always solved as a "forward" fold in page space, then mirrored
  at draw time.

## 1. FlipCalculation — the fold cone

Constructed per drag with `new FlipCalculation(direction, corner, pageWidth, pageHeight)`.
`direction ∈ {0 forward, 1 back}`, `corner ∈ {'top','bottom'}`.
`calc(point)` solves the fold for the finger point (in page space):

1. **Angle** (`calculateAngle`): with `e = pageWidth - x + 1` (horizontal
   distance to the spine/turn edge) and `i = corner==='bottom' ? pageHeight - y : y`:
   ```
   angle = 2·acos( e / √(i² + e²) );  if (i < 0) angle = -angle;
   angle = π - angle;                 // flip into fold orientation
   if (corner === 'bottom') angle = -angle;
   ```
   This is the classic page-fold cone: the flap is rigid, so the fold keeps
   the point equidistant from the two edges — the locus is a cone and the
   flap rotation is the half-angle at the finger.

2. **Page rect under rotation** (`getPageRect` → `getRectFromBasePoint`):
   the four page corners rotated by `angle` around the finger point
   (`getRotatedPoint`: `x' = x·cosθ + y·sinθ + px`, `y' = y·cosθ - x·sinθ + py`).
   Bottom corner uses a rect shifted up by `pageHeight` so the pivot is the
   bottom edge.

3. **Center-line clamping** (`checkPositionAtCenterLine`): the finger point
   is first clamped to a circle of radius `pageWidth` centered at the
   spine-corner (`LimitPointToCircle`); if the rotated rect's far corner
   crosses the spine (`a.x <= 0`), it is further clamped to a circle of
   radius `√(pageWidth²+pageHeight²)` — this is what keeps the fold from
   inverting past the spine. `Math.abs(x-pageWidth)<1 && |y|<1` throws
   ("Point is too small") → degenerate, hold last frame.

4. **Intersect points** (`calculateIntersectPoint`): clip-window is
   `(-1,-1,pageWidth+2,pageHeight+2)`. Segments (bottom corner shown):
   - `topIntersect` = ray [finger→rect.topRight] ∩ top edge y=0
   - `sideIntersect` = ray [finger→rect.bottomLeft] ∩ right edge x=pageWidth
   - `bottomIntersect` = [rect.bottomLeft→rect.bottomRight] ∩ bottom edge y=pageHeight
   (top corner mirrors these). `GetIntersectBeetwenTwoLine` = standard
   2×2 line intersection; `PointInRect` filters out-of-window results → null.

### Clip polygons (page space)
- **Flipping page** (`getFlippingClipArea`): `[topLeft, topIntersect,
  sideIntersect?, bottomIntersect?, (bottomLeft if open/bottom)]` — the part
  of the page that is still "on top", i.e. the lifted flap.
- **Bottom (revealed) page** (`getBottomClipArea`): the triangular-ish region
  already uncovered: from `topIntersect` along the top edge to the right,
  down the right edge to `pageHeight`, back through `sideIntersect` (if the
  side intersect is ≥10px from `topIntersect`) to `bottomIntersect`.

### Progress, direction, corners
- `getFlippingProgress() = |(position.x - pageWidth) / (2·pageWidth)·100|` —
  0% at rest, 100% fully across. **Measured in page/calc space** (mirrored
  for back) — gotcha we hit: measure it consistently with your input space.
- `getActiveCorner()` = `dir===0 ? rect.topLeft : rect.topRight` — flap
  transform anchor.
- `getAngle()` = `dir===0 ? -angle : angle` (sign flips for back).
- `getBottomPagePosition()` = `dir===1 ? {pageWidth,0} : {0,0}`.
- Shadow line: from `shadowStart` (top: `topIntersect`; bottom:
  `sideIntersect ?? topIntersect`) toward `sideIntersect ?? bottomIntersect`;
  `getShadowAngle` = angle of that segment vs the top edge
  (π−θ for back).

## 2. HTMLPage.drawSoft — rendering (what produces the look)

For each frame the renderer sets `element.style.cssText` imperatively:

1. **Flap** (flipping page, `HTMLPage.draw`): `transform-origin: 0 0`;
   the clip polygon is converted to **flap-local coords** by mirroring for
   back (`{x:-p.x+position.x, y:p.y-position.y}`), rotating by the fold
   angle (`GetRotatedPoint` about the origin), then emitted as
   `clip-path: polygon(...)`; the element itself is placed with
   `transform: translate3d(globalPos.x, globalPos.y, 0) rotate(angle rad)`
   where `globalPos = convertToGlobal(activeCorner)`. Safari gets a
   separate no-rotate translate branch.
2. **Bottom page** (`draw`, portrait): drawn with the bottom clip area
   polygon, position `getBottomPagePosition()`, angle 0.
3. **Hidden pages**: every page not in {left,right,bottom,flipping} gets
   `display:none`; z-indexes: static pages `startZIndex+1`, bottom `+3`,
   flap `+5`, shadows `+4/+10`.
4. **Hard density fallback** (`drawHard`): `rotateY` about the spine with
   `backface-visibility:hidden`, hard angle `±90·(200−2·progress)/100` —
   only used for hard pages (covers), not our soft full-bleed pages.

## 3. Shadows (HTMLPageRender) — the eye-candy

`Render.setShadowData(pos, angle, width, opacity, direction, progress)` with
`width = ¾·pageWidth·progress/100`, `opacity = (100−progress)·maxShadowOpacity/100`.
Both shadow divs are `transform-origin: <s|0>px 100px`, then
`translate3d(globalPos−anchor) rotate(shadowAngle + 3π/2 rad)`, clipped by
the page rect rotated into shadow space:
- **Outer** (on the static page beneath the flap): `linear-gradient`
  *toward* the fold (`to right` forward / `to left` back),
  `rgba(0,0,0,opacity) → transparent`, clipped to the un-folded page rect
  rotated into shadow space.
- **Inner** (on the flap itself): width ¾·shadowWidth, gradient
  `opacity → 0.05 → opacity → 0` (dark-light-dark band = the crease),
  direction per `direction`, clipped to the live `pageRect` corners
  (same flap-local transform as the flap clip).

## 4. Flip animation (Flip controller)

- `animateFlippingTo(from, to, commit)`: **discrete point sampling**, not
  tweening — `GetCordsFromTwoPoint` walks unit steps (max of |Δx|,|Δy|)
  between the two finger points; each step's point is pushed as a frame
  callback that runs `do(point)`. Frame duration = flippingTime scaled by
  `frames/1000` (long drags cap at flippingTime, short hops are fast).
  rAF render loop picks frames by elapsed time.
- Commit: `onAnimateEnd` runs `turnToNextPage/turnToPrevPage` when the
  animation was a commit; `user_fold` release calls `stopMove()` — commits
  iff current fold `position.x <= 0`, else animates back. (Library default
  commit threshold ≈ 100% — we chose 30% / flick-velocity in PageReader.)
- `flip()` (programmatic/click): start point clamped onto the page, animate
  to `({pageWidth−h/10, …} → {−pageWidth, …})`.
- `getDirectionByPoint` (portrait): `x − pageWidth <= width/5 → back(1)`
  else `forward(0)` — the last fifth of the page width is swipe-back
  territory.

## 5. Gotchas we hit (keep for the reimplementation)

- `disableFlipByClick` gates `Flip.flip()` on `isPointOnCorners()` (corner
  cone = `√(w²+h²)/5`); synthesized programmatic points off-book get
  swallowed → lift the flag around programmatic calls.
- Progress must be measured in the SAME space the caller's point lives in;
  the library mirrors inside `calc` and we mirrored at input — mixing the
  two inverted back-fold progress (visually-90% read as ~10%).
- CSS `perspective: 2000px` on `.stf__block` gives soft pages their subtle
  depth; `transform-style: preserve-3d` on items.
- UI swipe test: `|dx| > swipeDistance && |dy| < 2·swipeDistance &&
  dt < 250ms`, then synthesized `flipNext/flipPrev`.
