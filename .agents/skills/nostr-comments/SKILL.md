---
name: nostr-comments
description: Implement Nostr comment systems, add discussion features to posts/articles, build community interaction features, or attach comments to any external content identifier including URLs, hashtags, and NIP-73 identifiers (ISBN, podcast GUIDs, geohashes, movie ISANs, blockchain transactions, and more).
---

# Adding Nostr Comments Sections

This skill provides a complete commenting system using NIP-22 (kind 1111) comments that can be added to any Nostr event, URL, hashtag, or NIP-73 external content identifier. The `CommentsSection` component renders a lightweight, inline commenting interface with threaded replies, user authentication, and a per-comment actions menu (Open in Ditto, Delete own comment).

**The comment system is not included in the project by default.** When the user wants comment functionality, follow the setup instructions below to install the files.

## Files Provided by This Skill

All files live under `.agents/skills/nostr-comments/files/` and must be copied into `src/` preserving the directory structure:

| Skill file | Copy to |
|---|---|
| `files/hooks/useComments.ts` | `src/hooks/useComments.ts` |
| `files/hooks/usePostComment.ts` | `src/hooks/usePostComment.ts` |
| `files/components/comments/Comment.tsx` | `src/components/comments/Comment.tsx` |
| `files/components/comments/CommentForm.tsx` | `src/components/comments/CommentForm.tsx` |
| `files/components/comments/CommentsSection.tsx` | `src/components/comments/CommentsSection.tsx` |

## Setup Instructions

### 1. Dependencies

No extra npm packages are required — the skill uses only packages already present in the template (`@nostrify/nostrify`, `@nostrify/react`, `@tanstack/react-query`, `nostr-tools`, `date-fns`, `lucide-react`, `react-router-dom`, and shadcn/ui components).

### 2. Copy the Skill Files Into `src/`

Copy every file listed in the table above from `.agents/skills/nostr-comments/files/` into its corresponding location under `src/`. Preserve the exact paths — the files use `@/hooks/...` and `@/components/...` imports that depend on these locations.

### 3. Required Project Components

The comment components depend on pieces that already ship with the template:

- `@/components/NoteContent` — renders comment text (used by `Comment.tsx`)
- `@/components/auth/LoginArea` — shown to logged-out users (used by `CommentForm.tsx`)
- `@/components/ui/alert-dialog` — confirms deletion (used by `Comment.tsx`)
- `@/hooks/useAuthor` — fetches comment author profile (used by `Comment.tsx`)
- `@/hooks/useCurrentUser` — determines whether to show the composer and the Delete action (used by `CommentForm.tsx`, `Comment.tsx`)
- `@/hooks/useNostrPublish` — publishes kind 1111 comments and kind 5 deletion requests (used by `usePostComment.ts`, `Comment.tsx`)
- `@/hooks/useToast` — user feedback on delete success/failure (used by `Comment.tsx`)

All of these are standard in the template; no extra work is needed beyond copying the skill files.

## Basic Usage

`CommentsSection` renders without an outer card, title, or header — it's just the composer followed by the threaded comment list. Wrap it in whatever page layout you want:

```tsx
import { CommentsSection } from "@/components/comments/CommentsSection";

function ArticlePage({ article }: { article: NostrEvent }) {
  return (
    <div className="space-y-6">
      {/* Your article content */}
      <div>{/* article content */}</div>

      {/* Comments section — add your own heading if needed */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Comments</h2>
        <CommentsSection root={article} />
      </section>
    </div>
  );
}
```

## Per-Comment Actions Menu

Each comment has a 3-dots menu with:

- **Open in Ditto** — opens the comment at `https://ditto.pub/<nevent>` in a new tab so users can view replies, react, or zap via Ditto.
- **Delete** — only shown when the logged-in user is the comment's author. Publishes a NIP-09 (kind 5) deletion request tagging the comment's `id` and `kind`, then optimistically removes the comment from the cached query result via `queryClient.setQueriesData`. Deletion is not guaranteed across the network — the `AlertDialog` confirmation makes this clear to the user.

## Props and Customization

The `CommentsSection` component accepts the following props:

- **`root`** (required): The root to comment on. Accepts three types:
  - `NostrEvent` — comment on a Nostr event (kind 1 note, long-form article, etc.)
  - `URL` — comment on an external identifier: web URLs (`new URL("https://...")`) or any NIP-73 identifier except hashtags (e.g. `new URL("isbn:9780765382030")`, `new URL("iso3166:US")`)
  - `#${string}` — NIP-73 hashtag only (e.g. `"#bitcoin"`); this template string type is exclusively for hashtags and must not be used for other NIP-73 identifiers
- **`emptyStateMessage`**: Message shown when no comments exist (default: "No comments yet")
- **`emptyStateSubtitle`**: Subtitle for empty state (default: "Be the first to share your thoughts!")
- **`className`**: Additional CSS classes applied to the outer `<div>` (it's a plain `space-y-6` container, no card/border)
- **`limit`**: Maximum number of comments to load (default: 500)

```tsx
<CommentsSection
  root={event}
  emptyStateMessage="Start the conversation"
  emptyStateSubtitle="Share your thoughts about this post"
  className="mt-8"
  limit={100}
/>
```

## Commenting on URLs

The comments system supports commenting on external URLs, making it useful for web pages, articles, or any online content:

```tsx
<CommentsSection
  root={new URL("https://example.com/article")}
/>
```

## Commenting on Hashtags

Pass a hashtag string (`#${string}` format) to attach comments to a topic. The hashtag must be lowercase:

```tsx
// Comments for the #bitcoin hashtag
<CommentsSection
  root="#bitcoin"
/>

// Comments for a community-specific tag
<CommentsSection
  root="#nostr"
/>
```

## Commenting on NIP-73 External Content Identifiers

NIP-73 defines a standard set of external content IDs. All NIP-73 identifiers (except hashtags) are passed as `URL` objects — the identifier string is used directly as the URL:

### Books (ISBN)

```tsx
// ISBN must be without hyphens
<CommentsSection
  root={new URL("isbn:9780765382030")}
/>
```

### Podcasts

```tsx
// Podcast feed
<CommentsSection
  root={new URL("podcast:guid:c90e609a-df1e-596a-bd5e-57bcc8aad6cc")}
/>

// Podcast episode
<CommentsSection
  root={new URL("podcast:item:guid:d98d189b-dc7b-45b1-8720-d4b98690f31f")}
/>
```

### Movies (ISAN)

```tsx
// ISAN without version part
<CommentsSection
  root={new URL("isan:0000-0000-401A-0000-7")}
/>
```

### Geohashes

```tsx
// Geohash must be lowercase
<CommentsSection
  root={new URL("geo:ezs42e44yx96")}
/>
```

### Countries (ISO 3166)

```tsx
// ISO 3166 codes must be uppercase
<CommentsSection
  root={new URL("iso3166:US")}
/>

// Subdivision (state/province)
<CommentsSection
  root={new URL("iso3166:US-CA")}
/>
```

### Academic Papers (DOI)

```tsx
// DOI must be lowercase
<CommentsSection
  root={new URL("doi:10.1000/xyz123")}
/>
```

### Blockchain Transactions and Addresses

```tsx
// Bitcoin transaction
<CommentsSection
  root={new URL("bitcoin:tx:a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d")}
/>

// Ethereum address
<CommentsSection
  root={new URL("ethereum:1:address:0xd8da6bf26964af9d7eed9e03e53415d37aa96045")}
/>
```
