import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { NSchema } from '@nostrify/nostrify';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export interface NostrUser {
  pubkey: string;
  metadata?: NostrMetadata;
  isFollow?: boolean;
  score?: number;
}

/** Set of pubkeys in the logged-in user's kind 3 contact list. */
export function useFollows() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<Set<string>>({
    queryKey: ['follows', user?.pubkey ?? ''],
    enabled: !!user,
    staleTime: 300_000,
    queryFn: async () => {
      const events = await nostr.query(
        [{ kinds: [3], authors: [user!.pubkey], limit: 1 }],
        { signal: AbortSignal.timeout(4000) },
      );
      const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
      return new Set(latest?.tags.filter(([n]) => n === 'p').map(([, v]) => v).filter(Boolean) ?? []);
    },
  });
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  // subsequence match
  let i = 0;
  for (const ch of t) {
    if (i < q.length && ch === q[i]) i++;
  }
  return i === q.length ? 30 : 0;
}

/** Extract kind 0 metadata from a batch of events (latest per pubkey). */
export function kind0ToUsers(events: NostrEvent[], follows?: Set<string>, query?: string): NostrUser[] {
  const byPubkey = new Map<string, NostrEvent>();
  for (const e of events.sort((a, b) => b.created_at - a.created_at)) {
    if (!byPubkey.has(e.pubkey)) byPubkey.set(e.pubkey, e);
  }
  const users: NostrUser[] = [];
  for (const [pubkey, e] of byPubkey) {
    let metadata: NostrMetadata | undefined;
    try {
      metadata = NSchema.json().pipe(NSchema.metadata()).parse(e.content);
    } catch {
      continue;
    }
    const isFollow = follows?.has(pubkey) ?? false;
    const name = metadata.display_name || metadata.name || '';
    let score = 20;
    if (query) {
      score = Math.max(
        fuzzyScore(query, name),
        fuzzyScore(query, metadata.nip05 ?? '') * 0.9,
        fuzzyScore(query, metadata.name ?? '') * 0.8,
      );
    }
    if (score > 0 || !query) users.push({ pubkey, metadata, isFollow, score: score + (isFollow ? 50 : 0) });
  }
  return users.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 20);
}

/**
 * Search Nostr users by display name / nip05.
 * NIP-50 search on search-capable relays (ditto), ranked fuzzy client-side,
 * follows (kind 3) boosted to the top.
 */
export function useUserSearch(query: string) {
  const { nostr } = useNostr();
  const { data: follows } = useFollows();
  const q = query.trim();

  return useQuery<NostrUser[]>({
    queryKey: ['user-search', q.toLowerCase(), follows ? 'f' : 'n'],
    enabled: q.length >= 2,
    staleTime: 120_000,
    queryFn: async ({ signal }) => {
      // 1. NIP-50 profile search
      const events = await nostr
        .query([{ kinds: [0], search: q, limit: 50 }], { signal: AbortSignal.timeout(4000) })
        .catch(() => []);
      const results: NostrUser[] = kind0ToUsers(events, follows, q);

      // 2. If the query looks like a nip05, resolve it directly
      if (q.includes('@') && q.includes('.')) {
        try {
          const [name, domain] = q.replace(/^.*@/, '').includes('.') ? q.split('@') : [null, null];
          if (name && domain) {
            const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${name}`, { signal });
            const json = await res.json();
            const pubkey = json.names?.[name.toLowerCase()];
            if (pubkey && /^[0-9a-f]{64}$/.test(pubkey) && !results.some((u) => u.pubkey === pubkey)) {
              const profileEvents = await nostr.query(
                [{ kinds: [0], authors: [pubkey], limit: 1 }],
                { signal: AbortSignal.timeout(3000) },
              ).catch(() => []);
              const users = kind0ToUsers(profileEvents, follows, undefined);
              if (users.length) results.unshift({ ...users[0], score: 200 });
            }
          }
        } catch {
          // nip05 resolution is best-effort
        }
      }

      return results;
    },
  });
}

/** Sorted feed helper: mutuals/follows first. */
export function useRankByFollows() {
  const { data: follows } = useFollows();
  return useMemo(() => (pubkey: string) => follows?.has(pubkey) ?? false, [follows]);
}
