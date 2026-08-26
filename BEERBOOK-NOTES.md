# Beerbook — Phase 1 + 2 Notes

## Bugfix round (Aug 26, 2026) — NIP-19 routing, upload gating, home book = follows

Deployed to https://beerbook-test.surge.sh.

### 1. NIP-19 everywhere (no hex in URLs)
- New `src/lib/nip19links.ts`: `profilePath` (/u/npub1…), `beerPath` (/beer/naddr1… — naddr = kind 31006 + d + author pubkey), `readerPath` (/?page=note1…), `decodeNip19` (npub/nprofile/note/nevent/naddr).
- **Routes**: `/u/:npub` (npub primary, legacy hex still parsed); `/beer/:ref` accepts naddr1 (preferred), legacy d-slug/hex event-id; catch-all `/:nip19` (NIP19Page) now actually routes: npub/nprofile → Profile, note/nevent → redirect to `/?page=note1…`, naddr kind 31006 → BeerDetail, else 404.
- **Link generation**: BeerPage author link + Index “My Book” → npub; beer-name link → naddr via new `beer_pubkey` tag on check-ins (records the 31006 author so we can encode naddr; d-slug fallback kept for old events); profile tiles + BeerDetail check-in rows → `/?page=note1…` (Index decodes note/nevent/legacy-hex).
- **Share buttons**: new Share2 on each BeerPage (copies/Web-Shares `origin/?page=note1…`) and on BeerDetail (copies `origin/beer/naddr1…`).

### 2. Image upload — root cause & fix
- **Root cause found**: the upload path itself works — verified live with a real signed event: Blossom BUD-02 PUT to blossom.ditto.pub returned HTTP 201 + nip94 tags, and nostr.build NIP-98 upload succeeded (both under Centauri's key). The actual bug was UX/gating: **publishing was never blocked when the photo upload failed** (`canPublish` didn't require an image). When the Blossom auth (kind 24242) prompt is denied/unsupported by the signer, the upload throws — one easily-missed toast, then the user publishes a photo-less kind 1 → “prompted by signer but no image on page”. Verified end-to-end that an imeta-tagged event round-trips through the exact feed filters (`#t=beerbook` + authors).
- **Fixes**: `useUploadFile` now (a) validates a `url` tag came back, (b) falls back to nostr.build (NostrBuildUploader, NIP-98) when ALL blossom servers fail; Composer shows upload progress (⏳/✅), a persistent red error message on failure, clears the stale photo state, and **blocks publish until a photo is uploaded** (photo is required per plan). Check-ins also tag `beer_pubkey` now.

### 3. Home book = follows' book
- Index now defaults to **🤝 My Crew**: kind 3 follows ∪ you → relay-side `authors` filter on the #beerbook feed, rendered in the same swipeable PageReader. 🌍 **Discover** toggle switches to the global book (also default when logged out). Empty crew state offers the Discover toggle.

---

# Previous notes (Phase 1 + 2)

Status: Phase 2 (inventory, search, WOT) deployed to **https://beerbook-test.surge.sh** (test hosting only).
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

## Phase 2 (Aug 26, 2026)

- **Star rating restyle** (`StarRating.tsx`) — stars now sit in a dark translucent pill (`bg-black/35` + backdrop blur), filled = amber with darker amber rim + strong black drop-shadow, empty = amber-200. Default size 28 (page overlay 26, composer 32, detail rows 14). Readable over light AND dark photos.
- **Buddy search** (`useUserSearch.ts`) — composer tags friends by searching NIP-50 (kind 0 on ditto) by display name/nip05 with client-side fuzzy scoring (exact > prefix > substring > subsequence); nip05-style queries also resolve `/.well-known/nostr.json` directly. Selected buddies render as chips with avatar + name. npub paste still works (Enter = add top result / raw npub).
- **Web of trust** — `useFollows()` reads the logged-in user's kind 3; search results followed by you are boosted +50 and badged “Following”. Main feed has a 🤝 **Trusted** toggle filtering to check-ins only from kind 3 follows.
- **Beer inventory kind 31006** (`lib/beers.ts`) — parameterized replaceable, `d` = slug(brewery-beer-name), tags: name/brewery/style/abv/ibu/description/image/source/license. `pickCanonicalBeer()` prefers Beerbot records over user-created duplicates.
- **Composer beer search** (`useBeerSearch.ts`) — 3-tier: (1) NIP-50 search + `#d` lookup for kind 31006 on relays, (2) catalog.beer REST fallback (`api.catalog.beer/v1/beers?search=…`, optional basic-auth key via `VITE_CATALOG_BEER_KEY` or localStorage `beerbook:catalog-key`), (3) “Add new beer” form publishing 31006 from the user's key. Picking a catalog.beer beer ALSO auto-publishes it as 31006 at check-in time (self-populating inventory). Results cached in TanStack Query (5 min stale).
  - ⚠️ catalog.beer now requires an API key even for basic search (HTTP 401/404 without one) — get a key at catalog.beer and set `VITE_CATALOG_BEER_KEY`. Without a key the app silently skips that tier.
- **Check-ins** tag the beer via `beer: <d-slug-or-event-id>` (kept `beer_name`/`brewery` display tags). Beer name on the page overlay links to `/beer/:ref` (slug or event id both resolve).
- **Beer detail view** (`/beer/:ref`, `pages/BeerDetail.tsx`) — canonical 31006 record (image, style/ABV/IBU, avg community rating, catalog.beer attribution) + every check-in of that beer, each row deep-links the reader `/?page=<id>`.
- **Beerbot** — npub `npub13xacjek00a6kakxm45sz02sykq23u5ne4m37kuj3p9gr487gx64q4tsfnp` (hex pubkey `89bb…36aa`, key at `~/.beerbot/secret.hex`). Profile (kind 0, 🍺 emoji avatar) published to ditto/primal/nos.lol. `scripts/seed-beers.mjs`: pulls catalog.beer top-rated (paged, ~1 req/s), publishes 31006 events at ~1/s with `source: catalog.beer` + `license: CC-BY-4.0` attribution tags; `--count N`, `--dry-run`, `--profile` flags; falls back to a built-in 30-beer starter list (own data, no catalog attribution) when no API key. **Verified: 10/10 events + profile published successfully to all 3 relays** (readable back via NIP-50 `search: pliny` on relay.ditto.pub). Full 300-beer run awaits a catalog.beer API key.

## Stubbed for Phase 3 (per plan)

- Beer search / beer inventory events (kind 31xxx) / catalog.beer fallback — **DONE in Phase 2** (composer beer picker live).
- Beerbot seeding, NIP-58 badges, Badgebook tab. — Beerbot seeding script DONE + 10-beer verified; badges pending. Full seed needs catalog.beer API key.
- Geohash picker + reverse geocoding (location = free text).
- Zap amount picker (fixed 21 sats), zap-split targets, value-for-value.
- Tag-users UX is raw npub paste (no profile search / NIP-05 resolution yet). — **DONE in Phase 2** (buddy search + chips).
- Profile grid tiles open the global reader at that page rather than a per-user reader.
- No tests written for the new components yet (template smoke tests pass).

## Dev

```bash
cd ~/projects/beerbook
npm run dev      # :8080
npm run build    # dist/
npx surge dist beerbook-test.surge.sh
```
