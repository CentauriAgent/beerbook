import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import { BEERBOOK_RELAYS } from './beerbook';
import { buildCommentEvent, parseComment, timeAgo } from './comments';

const CHECK_IN = { id: 'cafe'.padEnd(64, '1'), pubkey: 'a'.padEnd(64, '2') };
const COMMENT = { id: 'b'.padEnd(64, '3'), pubkey: 'c'.padEnd(64, '4'), kind: 1111 };
const RELAY = BEERBOOK_RELAYS[0];

describe('buildCommentEvent — top-level comment on a check-in', () => {
  const ev = buildCommentEvent({ content: '  Looks delicious! 🍻 ', checkIn: CHECK_IN });

  it('is a kind 1111 with trimmed plaintext content', () => {
    expect(ev.kind).toBe(1111);
    expect(ev.content).toBe('Looks delicious! 🍻');
  });

  it('scopes to the root check-in with uppercase E/K/P tags', () => {
    expect(ev.tags).toContainEqual(['E', CHECK_IN.id, RELAY, CHECK_IN.pubkey]);
    expect(ev.tags).toContainEqual(['K', '1']);
    expect(ev.tags).toContainEqual(['P', CHECK_IN.pubkey, RELAY]);
  });

  it('points at the parent with lowercase e/k/p tags — parent IS the root for top-level', () => {
    expect(ev.tags).toContainEqual(['e', CHECK_IN.id, RELAY, CHECK_IN.pubkey]);
    expect(ev.tags).toContainEqual(['k', '1']);
    expect(ev.tags).toContainEqual(['p', CHECK_IN.pubkey, RELAY]);
  });

  it('rejects empty content', () => {
    expect(() => buildCommentEvent({ content: '   ', checkIn: CHECK_IN })).toThrow();
  });
});

describe('buildCommentEvent — reply to another comment', () => {
  const ev = buildCommentEvent({
    content: 'agreed!',
    checkIn: CHECK_IN,
    parent: COMMENT,
  });

  it('keeps the root scope on the check-in (E/K/P unchanged)', () => {
    expect(ev.tags).toContainEqual(['E', CHECK_IN.id, RELAY, CHECK_IN.pubkey]);
    expect(ev.tags).toContainEqual(['K', '1']);
    expect(ev.tags).toContainEqual(['P', CHECK_IN.pubkey, RELAY]);
  });

  it('switches the parent to the comment: e/k/p point at kind 1111', () => {
    expect(ev.tags).toContainEqual(['e', COMMENT.id, RELAY, COMMENT.pubkey]);
    expect(ev.tags).toContainEqual(['k', '1111']);
    expect(ev.tags).toContainEqual(['p', COMMENT.pubkey, RELAY]);
  });
});

describe('parseComment', () => {
  const base = { pubkey: 'p', created_at: 1700000000, sig: 's' } as const;

  it('parses a comment scoped via uppercase E', () => {
    const ev = {
      ...base,
      id: 'x',
      kind: 1111,
      content: 'nice',
      tags: [['E', CHECK_IN.id], ['e', CHECK_IN.id], ['p', CHECK_IN.pubkey]],
    } as NostrEvent;
    const c = parseComment(ev, CHECK_IN.id)!;
    expect(c.rootId).toBe(CHECK_IN.id);
    expect(c.parentId).toBe(CHECK_IN.id);
    expect(c.content).toBe('nice');
  });

  it('falls back to lowercase e for other clients and tracks the real parent', () => {
    const ev = {
      ...base,
      id: 'y',
      kind: 1111,
      content: 'reply',
      tags: [['e', COMMENT.id], ['E', CHECK_IN.id]],
    } as NostrEvent;
    const c = parseComment(ev, CHECK_IN.id)!;
    expect(c.parentId).toBe(COMMENT.id);
  });

  it('rejects events scoped to a different root', () => {
    const ev = {
      ...base,
      id: 'z',
      kind: 1111,
      content: 'other thread',
      tags: [['e', 'unrelated'.padEnd(64, '0')]],
    } as NostrEvent;
    expect(parseComment(ev, CHECK_IN.id)).toBeNull();
  });
});

describe('timeAgo', () => {
  const now = 1_700_000_000_000;
  it('formats compact relative times', () => {
    expect(timeAgo(now / 1000 - 30, now)).toBe('now');
    expect(timeAgo(now / 1000 - 120, now)).toBe('2m');
    expect(timeAgo(now / 1000 - 7200, now)).toBe('2h');
    expect(timeAgo(now / 1000 - 3 * 86400, now)).toBe('3d');
  });
});
