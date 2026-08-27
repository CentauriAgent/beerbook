import type { NostrEvent } from '@nostrify/nostrify';

import { BEERBOOK_RELAYS } from './beerbook';

/** The root of a comment thread: a Beerbook kind 1 check-in. */
export interface CheckInRef {
  id: string;
  pubkey: string;
}

/** What a comment replies to: either the check-in itself (top-level)
 * or another kind 1111 comment (nested reply). */
export interface CommentParent {
  id: string;
  pubkey: string;
  kind: number; // 1 for the check-in, 1111 for another comment
}

export interface BeerComment {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
  /** id of the kind 1 check-in this thread is scoped to. */
  rootId: string;
  /** id of the direct parent (check-in or comment); equals rootId for top-level. */
  parentId: string;
}

/**
 * Build a NIP-22 comment (kind 1111) on a check-in.
 *
 * Tagging follows NIP-22 exactly: uppercase tags scope the comment to the
 * ROOT event (`E`/`K`/`P`), lowercase tags point at the PARENT item
 * (`e`/`k`/`p`). For a top-level comment the parent IS the root check-in
 * (kind 1); for a reply to another comment the parent is that comment
 * (kind 1111) while the root scope stays the check-in.
 *
 * The `e`/`E` tags carry the author pubkey in the 4th position (NIP-22)
 * and a relay hint in the 3rd.
 */
export function buildCommentEvent(input: {
  content: string;
  checkIn: CheckInRef;
  parent?: CommentParent; // omit → top-level comment on the check-in
}): { kind: 1111; content: string; tags: string[][] } {
  const relay = BEERBOOK_RELAYS[0];
  const { checkIn } = input;
  const parent: CommentParent =
    input.parent ?? { id: checkIn.id, pubkey: checkIn.pubkey, kind: 1 };

  const content = input.content.trim();
  if (!content) throw new Error('Comment content is empty');

  const tags: string[][] = [
    // Root scope: the kind 1 check-in.
    ['E', checkIn.id, relay, checkIn.pubkey],
    ['K', '1'],
    ['P', checkIn.pubkey, relay],
    // Parent item: check-in (kind 1) or another comment (kind 1111).
    ['e', parent.id, relay, parent.pubkey],
    ['k', String(parent.kind)],
    ['p', parent.pubkey, relay],
    ['client', 'beerbook'],
  ];

  return { kind: 1111, content, tags };
}

/** Parse a kind 1111 event into a BeerComment. Returns null if the event
 * doesn't reference the given check-in id (via `E` root or `e` parent). */
export function parseComment(event: NostrEvent, checkInId: string): BeerComment | null {
  if (event.kind !== 1111) return null;

  const tag = (name: string): string | undefined =>
    event.tags.find(([n, v]) => n === name && v)?.[1];

  const rootId = tag('E') ?? tag('e');
  if (!rootId || rootId !== checkInId) return null;

  // Direct parent: lowercase `e`; for top-level comments it equals the root.
  const parentId = tag('e') ?? rootId;

  return {
    id: event.id,
    pubkey: event.pubkey,
    content: event.content,
    createdAt: event.created_at,
    rootId,
    parentId,
  };
}

/** "2h", "3d", "just now" — tiny helper, no dependency. */
export function timeAgo(createdAt: number, nowMs = Date.now()): string {
  const s = Math.max(0, Math.floor(nowMs / 1000 - createdAt));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return new Date(createdAt * 1000).toLocaleDateString();
}
