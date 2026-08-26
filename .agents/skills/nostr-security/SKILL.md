---
name: nostr-security
description: Threat model and defenses for a web Nostr client — why XSS is catastrophic when nsec keys live in localStorage, CSP as defense-in-depth, URL and CSS sanitization for untrusted event data, and author filtering for trust-sensitive queries (admin actions, moderators, addressable events, NIP-72 communities). Load when building trust-boundary features, rendering user-controlled URLs or markup, interpolating event data into CSS, or reviewing the app's security posture.
---

# Nostr Security

## Threat model

**Nostr private keys (`nsec`) are stored in plaintext in `localStorage`.** Any JavaScript running on the origin can read them with `localStorage.getItem('nostr-login')`. A successful XSS = instant, silent, irreversible key theft — no rotation, no revocation, permanent impersonation across every Nostr client the user ever touches. External signers (NIP-07 extension, NIP-46 bunker) don't change this: an XSS can still ask the active signer to sign arbitrary events, drain funds via zaps, or scrape DMs as they decrypt.

**Treat every piece of untrusted data as a script-injection vector** — event tags, `content`, metadata, URL params, relay responses.

## Defense-in-depth

**Content Security Policy.** `index.html` ships a restrictive CSP: `default-src 'none'`, `script-src 'self'` (no inline scripts, no `eval`), `base-uri 'self'`, `connect-src 'self' https: wss:`. The one intentional gap is `style-src 'unsafe-inline'` — required by Tailwind/shadcn — which means **CSS injection is not blocked by CSP; sanitization is on you**. When modifying CSP, only narrow it. Never add `'unsafe-eval'`, `'unsafe-inline'` on `script-src`, `http:`, or wildcard sources.

**Never use `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, or `document.write`** with event data, URL params, or any other untrusted string. React's JSX auto-escapes interpolated strings — the moment you bypass that, CSP alone won't save you. If you must render HTML from event data, pipe it through a strict allowlist sanitizer (e.g. DOMPurify) at the parse layer.

**Sanitize URLs and CSS values** — see §1 and §2.

## 1. URL sanitization

Any URL from event tags, `content`, metadata fields (`picture`, `banner`, `website`, `nip05`, etc.), or relay hints is untrusted. Threats beyond `javascript:` XSS: `data:` resource exhaustion / phishing, `http://` IP leaks, relative paths triggering same-origin requests, malformed strings crashing downstream parsers.

**Sanitize unconditionally at the parse layer.** mkstack doesn't ship a helper — add `src/lib/sanitizeUrl.ts` the first time you need one:

```ts
/** Returns canonical href for valid https:// URLs, undefined otherwise. */
export function sanitizeUrl(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
```

Apply it when extracting data from events, not at each render site:

```ts
function parseProfile(event: NostrEvent): Profile {
  const meta = JSON.parse(event.content);
  return {
    name: meta.name,
    picture: sanitizeUrl(meta.picture),
    banner: sanitizeUrl(meta.banner),
    website: sanitizeUrl(meta.website),
  };
}
```

**When sanitization is NOT required:** URLs matched by a regex that constrains the protocol (e.g. a content tokenizer matching `https?://...` — the regex *is* the sanitizer), hardcoded/app-generated URLs, and strings rendered as plain text that never land in an attribute, CSS value, or network request.

## 2. CSS injection

Event data interpolated into CSS (a `<style>` element, `style=""`, or an injected stylesheet) is a CSS injection vector. A `"`, `)`, `}`, or `;` in the value can break out of the string context and inject rules — overlay phishing, hide UI, exfiltrate via `background-image: url()` requests.

Common surfaces: `background-image: url("${url}")`, `font-family: "${family}"`, `@font-face { src: url("${url}") }`.

**Mitigation:**

- **URLs in `url()`** — use `sanitizeUrl()`. The `URL` constructor percent-encodes `"`, `)`, `\` and rejects non-`https:`.
- **Non-URL strings** (font-family, animation names) — allowlist safe characters:

```ts
/** Keeps Unicode letters/numbers, spaces, hyphens, underscores, apostrophes, periods. */
export function sanitizeCssString(value: string): string {
  return value.replace(/[^\p{L}\p{N} _\-'.]/gu, '');
}
```

```ts
// ❌ UNSAFE
style.textContent = `body { background-image: url("${rawUrl}"); font-family: "${rawFamily}"; }`;

// ✅ SAFE — validate URLs, allowlist identifiers
const bgUrl = sanitizeUrl(rawUrl);
const family = sanitizeCssString(rawFamily ?? '');
if (bgUrl && family) {
  style.textContent = `body { background-image: url("${bgUrl}"); font-family: "${family}"; }`;
}
```

If you can't justify the exact characters you're allowing, the policy is wrong.

## 3. Author filtering for trust-sensitive queries

Even with perfect XSS defenses, an attacker can publish forged events your UI will trust unless queries constrain `authors`. Relays are dumb pipes — any matching event comes back.

**Filter by `authors` when:**

- Querying admin/moderator/owner events — use a hardcoded trusted-pubkey list.
- Querying addressable events (kinds 30000–39999) — the `d` tag alone is not a trust boundary; the `(kind, pubkey, d)` triple is.
- Querying user-owned replaceable events (profile metadata, relay lists, mute lists) — `authors: [userPubkey]`.

**Do NOT filter by `authors`** for public UGC (kind 1 notes, reactions, zaps, discovery feeds) — anyone can post there by design.

```ts
// ❌ Anyone can publish kind 30078 with this d-tag and self-appoint
nostr.query([{ kinds: [30078], '#d': ['pathos-organizers'], limit: 1 }]);

// ✅ Only trust the admin list
nostr.query([{ kinds: [30078], authors: ADMIN_PUBKEYS, '#d': ['pathos-organizers'], limit: 1 }]);
```

**Routes for addressable/replaceable events must include the author** — otherwise the route handler can't construct a secure filter:

```tsx
// ❌ Any pubkey can squat the slug
<Route path="/article/:slug" element={<Article />} />
// ✅ Filter can include authors
<Route path="/article/:npub/:slug" element={<Article />} />
```

### NIP-72 community moderation

Kind 4550 approvals are only trustworthy if signed by a moderator from the community definition (kind 34550). Two-step query:

```ts
// 1. Fetch community definition — author-filter by the owner.
const [community] = await nostr.query([{
  kinds: [34550], authors: [communityOwnerPubkey], '#d': [communityId], limit: 1,
}]);
if (!community) return [];

// 2. Extract moderator pubkeys from `p` tags with role "moderator".
const moderators = community.tags
  .filter(([n, , , role]) => n === 'p' && role === 'moderator')
  .map(([, pubkey]) => pubkey);

// 3. Query approvals — only from moderators.
const approvals = await nostr.query([{
  kinds: [4550],
  authors: moderators,
  '#a': [`34550:${communityOwnerPubkey}:${communityId}`],
  limit: 100,
}]);
```

Without step 3's `authors` filter, anyone can publish a kind 4550 "approval".

## Pre-merge checklist

- [ ] No `dangerouslySetInnerHTML` / `innerHTML` / `document.write` with untrusted data.
- [ ] CSP unchanged or narrowed; no new `'unsafe-eval'`, `'unsafe-inline'` on `script-src`, `http:`, or wildcards.
- [ ] Every event-sourced URL passes `sanitizeUrl()` before reaching `href`, `src`, `srcSet`, `poster`, iframe `src`, or CSS.
- [ ] Every event-sourced string in CSS passes `sanitizeUrl()` (URLs) or `sanitizeCssString()` (identifiers).
- [ ] Every trust-sensitive query includes `authors`.
- [ ] Routes for addressable/replaceable events carry the author in the URL.
