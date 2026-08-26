# Page-Turn Library Research — Beerbook PageReader

*Researched 2026-08-26. Goal: realistic soft page curl/fold for a single-page, portrait, full-bleed mobile PWA reader. Pages are live DOM (photo + gradient overlay + text). Drag-tracked touch + desktop keyboard. React 19 + Vite + Tailwind 4.*

## TL;DR Recommendation

| | Pick | Why |
|---|---|---|
| 🥇 **Top pick** | **StPageFlip core (`page-flip` on npm) used directly, with our own thin React wrapper** | Battle-tested (113k weekly downloads), MIT, zero deps, TypeScript-native, full drag/touch/corner-fold tracking, live-DOM HTML mode, single-page portrait mode built in (`usePortrait`), keyboard trivial via `flipNext/flipPrev`. Caveat: its HTML "soft" curl is a *flat fold* (rotated element + clip-path), not a curved mesh — see below. |
| 🥈 **Runner-up** | **Finish the in-house WebGL curl (`src/lib/page-curl.ts`)** | The only way to get a *true* soft curl (curved mesh, cylinder shading) on live DOM is to rasterize the page to a texture and deform it — exactly what our existing attempt does. If StPageFlip's flat fold isn't "beautiful" enough, this is the honest runner-up, not another library. |

There is **no actively-maintained library that does a true curved curl on live DOM**. That niche is empty on npm (verified via download stats + registry). Commercial players (3D FlipBook / real3d-flipbook, CodeCanyon/WordPress) do WebGL curls but are paid, GPL-ish, image-oriented, and not React-friendly.

---

## Candidate details

### 1. StPageFlip / `page-flip` (npm: `page-flip`) — TOP PICK ✅

- **Repo:** github.com/Nodlik/StPageFlip (846★, MIT, not archived, last push Jan 2024, 46 open issues)
- **npm:** `page-flip` v2.0.7 — **~113k downloads/week**, 19 dependents, last publish May 2022, MIT, **zero dependencies**.
- **How the HTML "soft" mode actually renders (verified from source):**
  - `HTMLPage.drawSoft()` — the page element is positioned with `transform: translate3d(...) rotate(angle)` and clipped with a `clip-path: polygon(...)`. The "fold" is the **fold-line geometry** computed by the physics (`FlipCalculation` — cone-based corner position, like the classic Turner/`page-flip` math).
  - The page is rendered as **two flat pieces** (element + a `cloneNode` temporary copy, see `newTemporaryCopy()`), one per side of the fold line, plus rotated gradient divs for inner/outer shadow (`drawInnerShadow` / `drawOuterShadow` in `HTMLRender.ts`).
  - **It is NOT a curved mesh.** There is no curvature/bend on the paper in HTML mode — the paper creases along a straight line. It looks good (many production flipbooks use it) but it's a "flat fold," not the soft cylinder curl you see in iBooks.
  - The **canvas/image mode** (`CanvasRender`) *does* draw a true curl — but only for images, not DOM.
- **Single-page portrait:** Yes, first-class. `usePortrait: true` (default) switches to one-page display; `showCover` marks first/last pages hard in single-page mode. Note: portrait mode clones HTML elements (documented).
- **Drag interaction:** Yes, core feature. Corner + edge drag from rest (`user_fold`, `fold_corner` states), full finger tracking, release-to-commit physics, `swipeDistance` config, `useMouseEvents`, `mobileScrollSupport` (prevents scroll-fight on touch), `disableFlipByClick` to reserve taps for UI.
- **React usage:** `react-pageflip` wrapper exists (npm, 83k dl/wk, MIT) but is stale (last publish May 2022, built for React 16/17 era class-component patterns) and fights React 19's strict mode/double-render. **Recommended pattern: use `page-flip` core directly** behind our own `usePageFlip()` hook:
  - Render page elements declaratively as children (they must exist in DOM), call `loadFromHtml` in an effect, `updateFromHtml` when check-ins change, `destroy()` on unmount.
  - Keyboard: listen on the container, call `flipNext('bottom')` / `flipPrev('bottom')`.
  - Watch out: StPageFlip takes ownership of the parent element's children/styles — pages should be dumb leaf components (our `BeerPage` content) rather than interactive React state inside.
- **TypeScript:** Written in TS; ships its own `.d.ts`. First-class.
- **Bundle size:** ~35–45 KB min (single file, no deps) — negligible.
- **Known mobile quirks:** (1) iOS Safari `clip-path` perf on very large elements — fine at phone sizes; library even has a Safari-specific transform workaround in source. (2) `mobileScrollSupport: true` blocks page scroll over the book — set carefully since our reader is full-bleed (this is what we want anyway). (3) Portrait-mode HTML cloning means React-rendered content inside pages is cloned during flips — avoid live updates mid-flip.
- **Rating for Beerbook: 8/10.** Everything fits except "true soft curl" — it's a flat fold. But it's the only mature, free, DOM-based option, and its drag physics + portrait mode + TS support are exactly our requirements.

### 2. `react-pageflip` (npm wrapper for StPageFlip) — skip ⚠️

- 83k dl/wk, MIT, v2.0.3, **last published May 2022**. Simple wrapper exposing `<HTMLFlipBook>`; still works (it's just a ref + effect) but: no React 19 testing, no concurrent-mode hygiene, peerDeps predate React 18, children reconciliation is manual (`updateFromHtml` on every render). Since the wrapper is ~100 lines, writing our own hook against `page-flip` core is lower-risk than depending on it. **Rating: 5/10** (viable shortcut, but stale).

### 3. nkalahanov/book_page_flip — NOT VIABLE ❌

- **Confirmed: Flutter-only** (pub.dev package, `flutter pub add book_page_flip`, `StatefulWidget` API, runs on Flutter's 6 platforms). True 3D mesh curl with drag, materials, presets — genuinely the best "realistic curl" engineering in this search — but it cannot be used in a React web app. **Rating: 0/10 for our stack** (would be top pick if Beerbook were Flutter).

### 4. turn.js — NOT VIABLE ❌

- jQuery plugin (~2012–2017), site turnjs.com offline/unreachable, no npm package of record (a `turn.js` npm name gets 386 dl/wk but is not the canonical project). License historically unclear/non-standard (source headers restrict commercial redistribution), effectively unmaintained, no touch drag quality, no TypeScript. **Rating: 1/10.**

### 5. Other npm options surveyed (download numbers, last week)

- `flipbook-vue` (2,015 dl/wk) — Vue component wrapping `page-flip`… i.e., StPageFlip again. Confirms StPageFlip is the ecosystem default. Not for React.
- `react-flip-page` (675 dl/wk) — CSS 3D flip only, no curl, no drag physics. Same problem we already have.
- `3d-flip-book` (104 dl/wk) — thin/unofficial, not the commercial 3D FlipBook; not maintained.
- `flipbook` (48 dl/wk), `vue-flip-page` (18 dl/wk) — negligible.
- **Commercial WebGL flipbooks** (3D FlipBook / real3d-flipbook on CodeCanyon, DearFlip, etc.): real curl, but paid licenses, WordPress/jQuery-centric, usually image-PDF based, license terms incompatible with an open permissive app. Not evaluated further.
- **three.js-based open components:** no maintained, >500-dl/wk page-curl component exists on npm. The well-known three.js curl demos (e.g., the classic "page curl" shader experiments) are unmaintained gists. This is exactly the road our own `src/lib/page-curl.ts` is on.

### 6. alvarotrigo.com fullPage page-flip generator

- Their flip demos embed StPageFlip (`page-flip`) — same library, confirming it's the de-facto standard. Not a separate option.

---

## The honest trade-off

The "beautiful realistic soft curl on **live DOM**" requirement conflicts with every mature library:

- True curl requires rasterizing the page (canvas/WebGL texture) — StPageFlip does this **only for images**; our pages are DOM.
- StPageFlip HTML mode keeps DOM live but the fold is **flat** (straight crease, two clipped halves, gradient shadows). It reads as "paper," just not iBooks-curvy.

So the decision is:

1. **Ship StPageFlip** (own React wrapper, `usePortrait`, soft density, corner drag) → pragmatic, gorgeous-enough, zero-risk physics, ~1–2 day integration. **This is the recommendation.**
2. **If the flat fold isn't good enough**, the runner-up isn't another npm package — it's **finishing our WebGL curl** (`page-curl.ts` rasterizes DOM → texture → bent mesh). That's the only path to a true curl; estimate 3–7 more days of shader/edge-case work (text sharpness at 3x DPR, backface content, gesture conflicts), with full ownership forever.

### Integration estimate (StPageFlip → our `PageReader`)

- **Effort: ~1–2 days.** Steps:
  1. `npm i page-flip`
  2. New `src/components/FlipBook.tsx` (or hook `usePageFlip`): container ref, children rendered from `checkIns.map(...)` as `.beer-page` divs, effect → `new PageFlip(el, { width, height, size: 'stretch', usePortrait: true, showCover: false, mobileScrollSupport: true, swipeDistance: 30 })` + `loadFromHtml`; `updateFromHtml` on checkIn change; `destroy()` cleanup.
  3. Wire `on('flip')` → current index state; keyboard ←/→/Space → `flipPrev/flipNext`; keep `playPaperCrackle()` on `changeState === 'flipping'`.
  4. Drop `TURN_THRESHOLD`/spring code from PageReader (library owns physics); keep `BeerPage` as the page content component unchanged.
- Risks: page content must not resize mid-flip; test 3x-DPR iOS clip-path perf; React StrictMode double-mount handled by proper `destroy()`.
