---
name: note-content
description: Render plaintext Nostr note content (kind 1, 11, 1111) with linkified URLs, hashtags, Nostr mentions, custom emoji (NIP-30), flag-to-country links, inline images/video/audio, BOLT11 lightning invoices, embedded nevent/naddr cards, and link previews.
---

# Rich Text Rendering for Nostr Notes

This skill provides a full-featured `NoteContent` component that turns a Nostr event's plaintext `content` field into rich React output. It is adapted from the production implementation in the Ditto client and handles:

- URLs — linkified, with trailing-punctuation stripping and line-end-aware rich preview cards (`LinkEmbed`) vs. inline links
- `wss://` / `ws://` relay URLs — internal links to `/r/<encoded-url>`
- Image URLs — rendered inline as thumbnails, with consecutive images auto-grouped into a gallery and a shared lightbox
- Video/audio URLs — inline players; webxdc `.xdc` URLs — WebXDC app embeds (stub)
- NIP-94 `imeta`-declared media — appended at end when the content string doesn't reference them
- BOLT11 lightning invoices — rendered as `LightningInvoiceCard`
- Hashtags — internal links to `/t/<tag>`, with full Unicode letter support (`\p{L}\p{N}_`)
- Nostr mentions (`nostr:npub…`, `nostr:nprofile…`, bare `npub…`, `@npub…`) — resolved via `useAuthor`, rendered as `@DisplayName` links with optional `ProfileHoverCard`
- Embedded notes (`nostr:note1…`, `nostr:nevent1…`) — rendered as `EmbeddedNote` cards, enriched with relay/author hints from `q` tags
- Embedded addressable events (`nostr:naddr1…` or URLs containing an `naddr1` fragment) — rendered as `EmbeddedNaddr` cards
- Custom emoji (NIP-30 `:shortcode:`) — inline images from the event's own `emoji` tags, with the viewer's `useCustomEmojis` collection as fallback
- Flag emoji (🇺🇸, 🇵🇱, …) — linkified to `/i/iso3166:<CC>` pages
- "Emoji-only" posts — auto-detected and rendered at large size (`text-5xl`)
- Whitespace normalization — leading/trailing whitespace trimmed, redundant blank lines around block embeds collapsed
- Opt-out props — `disableEmbeds`, `disableMediaEmbeds`, `disableNoteEmbeds`, `hideEmbedImages` for preview contexts and recursive embed cards

**This component is not included in the project by default.** When the user's app displays text notes or other plaintext event content, follow the setup instructions below to install it.

## Files Provided by This Skill

Install all files from `.agents/skills/note-content/files/` into their matching `src/` locations:

### Core component & test

| Skill file | Copy to |
|---|---|
| `files/components/NoteContent.tsx` | `src/components/NoteContent.tsx` |
| `files/components/NoteContent.test.tsx` | `src/components/NoteContent.test.tsx` |

### Library helpers

| Skill file | Copy to |
|---|---|
| `files/lib/mediaUrls.ts` | `src/lib/mediaUrls.ts` |
| `files/lib/sanitizeUrl.ts` | `src/lib/sanitizeUrl.ts` |
| `files/lib/imeta.ts` | `src/lib/imeta.ts` |
| `files/lib/customEmoji.ts` | `src/lib/customEmoji.ts` |
| `files/lib/getDisplayName.ts` | `src/lib/getDisplayName.ts` |
| `files/lib/avatarShape.ts` | `src/lib/avatarShape.ts` |
| `files/lib/countries.ts` | `src/lib/countries.ts` |

### Hooks

| Skill file | Copy to |
|---|---|
| `files/hooks/useCustomEmojis.ts` | `src/hooks/useCustomEmojis.ts` |
| `files/hooks/useBlossomFallback.ts` | `src/hooks/useBlossomFallback.ts` |
| `files/hooks/useProfileUrl.ts` | `src/hooks/useProfileUrl.ts` |

### Companion components (minimal stubs — replace with richer versions later)

| Skill file | Copy to | Responsibility |
|---|---|---|
| `files/components/LinkEmbed.tsx` | `src/components/LinkEmbed.tsx` | Rich link preview card |
| `files/components/EmbeddedNote.tsx` | `src/components/EmbeddedNote.tsx` | `note1` / `nevent1` quote card |
| `files/components/EmbeddedNaddr.tsx` | `src/components/EmbeddedNaddr.tsx` | `naddr1` addressable-event card |
| `files/components/LightningInvoiceCard.tsx` | `src/components/LightningInvoiceCard.tsx` | BOLT11 invoice display / pay button |
| `files/components/VideoPlayer.tsx` | `src/components/VideoPlayer.tsx` | Inline video |
| `files/components/AudioVisualizer.tsx` | `src/components/AudioVisualizer.tsx` | Inline audio |
| `files/components/WebxdcEmbed.tsx` | `src/components/WebxdcEmbed.tsx` | WebXDC app launcher |
| `files/components/ImageGallery.tsx` | `src/components/ImageGallery.tsx` | Image grid + shared `Lightbox` |
| `files/components/ProfileHoverCard.tsx` | `src/components/ProfileHoverCard.tsx` | Hover profile preview |
| `files/components/CustomEmoji.tsx` | `src/components/CustomEmoji.tsx` | `CustomEmojiImg` + `EmojifiedText` |

The companion component stubs are **functional** — they render something sensible for every embed type — but deliberately minimal. Read the comment at the top of each file for notes on how to replace them with production-grade versions (OpenGraph scrapers, blurhash placeholders, WebLN-backed invoice payment, etc.).

## Setup Instructions

### 1. Dependencies

No extra npm packages are required. The skill uses only packages already present in the template:

- `react`, `react-router-dom` (internal `Link`)
- `nostr-tools` (`nip19` decoding/encoding)
- `@nostrify/nostrify` (`NostrEvent`, `NostrMetadata`)

### 2. Copy the Skill Files Into `src/`

Copy every file listed in the tables above from `.agents/skills/note-content/files/` into its corresponding location under `src/`. Preserve the exact paths — everything uses `@/` imports that depend on these locations.

### 3. Routing Expectations

`NoteContent` generates links that assume these routes exist in `AppRouter.tsx`:

| Generated link | Route expected |
|---|---|
| `/<nip19-identifier>` (e.g. `/npub1…`, `/note1…`, `/nevent1…`, `/naddr1…`) | Handled by the template's `NIP19Page` at `/:nip19` |
| `/t/<hashtag>` | **Not in the default template.** Add `<Route path="/t/:hashtag" element={<HashtagPage />} />` if you want hashtag pages. |
| `/r/<encoded-wss-url>` | **Not in the default template.** Add `<Route path="/r/:relayUrl" element={<RelayPage />} />` if you want relay pages. |
| `/i/iso3166:<CC>` | **Not in the default template.** Add `<Route path="/i/iso3166::code" element={<CountryPage />} />` if you want flag-emoji country pages. |

Any unrouted link falls through to the 404 page — nothing breaks, but the affordance is inert.

## Usage

```tsx
import { NoteContent } from '@/components/NoteContent';
import type { NostrEvent } from '@nostrify/nostrify';

function Post({ event }: { event: NostrEvent }) {
  return (
    <article>
      {/* ...header, avatar, etc */}
      <NoteContent event={event} className="text-sm" />
    </article>
  );
}
```

### Props

```ts
interface NoteContentProps {
  event: NostrEvent;
  className?: string;
  /** Render URLs as inline links only — suppress LinkEmbed / image / video / audio / invoice previews. */
  disableEmbeds?: boolean;
  /** Hide the thumbnail in LinkEmbed previews (useful when a cover image is already shown). */
  hideEmbedImages?: boolean;
  /** Render nostr:nevent/note/naddr embeds as inline links, not cards. Use inside recursive quote cards. */
  disableNoteEmbeds?: boolean;
  /** Suppress images, galleries, and video/audio players entirely. Used inside lightweight quote cards. */
  disableMediaEmbeds?: boolean;
}
```

### Preview contexts

Inside a **recursive quote card** (e.g. when `EmbeddedNote` itself renders `NoteContent` for the quoted note), pass `disableNoteEmbeds disableMediaEmbeds` to prevent unbounded nesting and keep the card compact.

Inside a **compose preview** or a **triple-dot menu preview**, pass `disableEmbeds` to show only linkified URLs without any heavy previews.

## Upgrading the Companion Components

The stubs shipped here are deliberately minimal so the skill works immediately and can be committed without dragging in hundreds of extra files. When your app needs richer behaviour, progressively upgrade individual components — the JSX surface in `NoteContent` stays the same. Common upgrade paths:

- **`LinkEmbed`** → fetch OpenGraph metadata (title, description, thumbnail), detect YouTube/Twitter/Bluesky for embeddable players
- **`EmbeddedNote` / `EmbeddedNaddr`** → introduce a `useEvent(id, relays, author)` / `useAddrEvent({kind, pubkey, identifier}, relays)` hook and render the fetched event using a nested `<NoteContent disableNoteEmbeds disableMediaEmbeds>`
- **`LightningInvoiceCard`** → pair with the `nwc` skill's `useWallet` / `useZaps` to pay directly, decode the BOLT11 for amount/description/expiry, render a QR code
- **`VideoPlayer` / `AudioVisualizer`** → show blurhash placeholders from `imeta`, add full-screen / background-playback controls, respect `dim` for correct aspect ratio on first paint
- **`ImageGallery` / `Lightbox`** → add pinch-zoom, swipe gestures, blurhash placeholders, alt-text overlays
- **`WebxdcEmbed`** → host the WebXDC app in a sandboxed iframe with a Nostr-backed `sendUpdate` / `setUpdateListener` bridge
- **`ProfileHoverCard`** → open a shadcn `HoverCard` with the author's avatar, display name, bio, follow count, follow/zap/DM actions
- **`useCustomEmojis`** → fetch the viewer's kind 10030 "Emoji List" event and any kind 30030 "Emoji Set" events it references, expose all shortcode→URL pairs
- **`useBlossomFallback`** → parse the URL's blossom hash, rotate through the viewer's BUD-03 "User Server List" (kind 10063) on `onError`
- **`useProfileUrl`** → route by the user's verified `nip05` handle when present (requires a `/:handle` route), fall back to `/<npub>`

## Supported Content Patterns

| Pattern in `event.content` | Rendered as |
|---|---|
| `https://example.com/...` | Inline link if mid-line, or `LinkEmbed` card if URL ends a line |
| `https://…/image.jpg` (any `IMAGE_EXTS`) | Inline image; 2+ consecutive → `ImageGallery` |
| `https://…/video.mp4` (any `VIDEO_EXTS`) | `VideoPlayer` |
| `https://…/song.mp3` (any `AUDIO_EXTS`) | `AudioVisualizer` |
| `https://…/app.xdc` | `WebxdcEmbed` |
| `wss://relay…` | Internal `/r/<encoded>` link |
| URL containing `naddr1…` | Paired URL + `EmbeddedNaddr` card |
| `lightning:lnbc…` / `lnbc…` / `lntb…` / `lnbcrt…` / `lntbs…` | `LightningInvoiceCard` |
| `nostr:npub1…` or `nostr:nprofile1…` or bare `npub1…` | `@DisplayName` mention link (through `ProfileHoverCard`) |
| `nostr:note1…` / `nostr:nevent1…` or bare | `EmbeddedNote` card (relay/author hints pulled from event's `q` tags) |
| `nostr:naddr1…` or bare | `EmbeddedNaddr` card |
| `#hashtag` (Unicode letters OK) | Internal `/t/hashtag` link |
| 🇺🇸 🇵🇱 🇧🇷 … | Internal `/i/iso3166:US` link |
| `:custom_emoji:` (with matching `["emoji", …]` tag or viewer collection) | `CustomEmojiImg` |
| Plain text | Rendered as-is with `whitespace-pre-wrap`, `dir="auto"` for RTL |

## Tests

`NoteContent.test.tsx` covers URL linkification (kinds 1 and 1111), plain text, hashtag linkification, and mention rendering with fallback vs real display names. It uses the template's `TestApp` wrapper. Run via `npm run test` once the files are in `src/`.

## Related

- **`useAuthor`** — used internally for mention resolution and for audio-embed author avatar. Core template.
- **`NIP19Page`** — the template's `/:nip19` route that handles every kind of NIP-19 link this component generates.
- **`nwc` skill** — pair with `LightningInvoiceCard` for one-tap invoice payment via WebLN/NWC.
