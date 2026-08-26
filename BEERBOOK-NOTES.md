# Beerbook — Phase 1 Notes

Status: Phase 1 (MVP: The Book) deployed to **https://beerbook-test.surge.sh** (test hosting only).
Stack: MKStack (React 19 + Vite + Tailwind 4 + shadcn/ui + Nostrify + TanStack Query) + vite-plugin-pwa.

## What's built

- **Page reader** (`src/components/PageReader.tsx` + `BeerPage.tsx`)
  - Each check-in = a full-bleed photo page with bottom gradient overlay: beer/brewery, 5-star rating, tasting notes, flavor chips (9 fixed flavors), serving style, location, tagged-user avatars, author row.
  - Maximize button toggles the overlay for a clean full-photo view.
  - Mobile page turn: pointer-tracked drag peels the page in real time (CSS `perspective` + `rotateY`, origin-left), releases past 25% width or velocity 0.5px/ms → turn; below → spring back. Back-swipe peels the previous page in.
  - Desktop: ← → arrow keys + invisible edge click zones. Progress dots (≤12 pages) or "n / total" counter.
- **Composer** (`/new`) — beer + brewery free text, photo upload, star rating, flavor chips, serving, tasting notes, location, npub tagging, **live WYSIWYG page preview** (renders the actual BeerPage component).
- **Nostr integration** — kind 1 check-ins with tags: `t=beerbook`, `client=beerbook`, `rating`, `beer_name`, `brewery`, repeatable `flavor`, `serving`, `location`, `imeta`, `p`. Content fallback text for other clients. Login via MKStack LoginArea (NIP-07 extension, nsec, bunker). Feed: `kinds:[1] #t:[beerbook]` over MKStack default relays (ditto/dreamith/primal/nos.lol). Profile view `/u/:npub` = book grid with avg rating; tapping a tile deep-links the reader (`/?page=<id>`).
- **Zaps** (`src/hooks/useZap.ts`) — manual NIP-57 flow: author kind 0 → lud16 → `/.well-known/lnurlp/` → signed kind 9734 zap request embedded in invoice → webln payment or `lightning:` fallback. Zap button on each page (21 sats fixed). Success/failure toast.
- **Branding** — amber/cream palette (light) + aged-leather dark, Georgia serif body, book-paper grain background, hand-drawn SVG 🍺📖 app icon, manifest "Beerbook", installable PWA (auto-update SW, offline shell, CacheFirst for cross-origin images). CSP extended with `worker-src 'self' blob:`.

## Decisions / gotchas

- **Photos** upload via MKStack's Blossom uploader (`blossom.ditto.pub` etc.), not nostr.build NIP-96 — same outcome, NIP-92 `imeta` tag with url/x/m/dim. nostr.build can be added as a server later via app config.
- Nostrify 0.55 has **no NIP-57 helper**, so zap logic is hand-rolled; for lud16 we hit the LNURL-pay URL directly (no bech32 needed — first draft tried an inline encoder, scrapped it).
- `nostr.build`/`nostrpic` image URLs render fine through the existing `img-src https:` CSP.
- Custom tag names: used `beer_name`/`brewery`/`location` as plain tags (plan's `g:` geohash deferred — location is free text for now).
- `imeta` is constructed as `['imeta', 'url …', 'x …', ...]` from uploader tag pairs.

## Stubbed for Phase 2 (per plan)

- Beer search / beer inventory events (kind 31xxx) / catalog.beer fallback — composer is free-text only.
- Beerbot seeding, NIP-58 badges, Badgebook tab.
- Geohash picker + reverse geocoding (location = free text).
- Zap amount picker (fixed 21 sats), zap-split targets, value-for-value.
- Tag-users UX is raw npub paste (no profile search / NIP-05 resolution yet).
- Profile grid tiles open the global reader at that page rather than a per-user reader.
- No tests written for the new components yet (template smoke tests pass).

## Dev

```bash
cd ~/projects/beerbook
npm run dev      # :8080
npm run build    # dist/
npx surge dist beerbook-test.surge.sh
```
