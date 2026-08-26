import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrFilter } from '@nostrify/nostrify';
import { NSchema } from '@nostrify/nostrify';
import { parseCheckIn, type BeerCheckIn } from '@/lib/beerbook';
import { useNostrPublish } from './useNostrPublish';

/** Subscribe to #beerbook kind 1 events, honoring NIP-09 kind 5 deletions. */
export function useBeerbookFeed(opts?: { authors?: string[] }) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['beerbook-feed', opts?.authors ?? ['global']],
    queryFn: async ({ signal }) => {
      const filter: NostrFilter = { kinds: [1], '#t': ['beerbook'], limit: 100 };
      if (opts?.authors) filter.authors = opts.authors;
      const events = (await nostr.query([filter], { signal }))
        .filter((e) => NSchema.id().safeParse(e.id).success);

      // Fetch deletion events (kind 5) from the same authors and drop deleted check-ins.
      const authorSet = new Set(events.map((e) => e.pubkey));
      const deleted = new Set<string>();
      if (authorSet.size > 0) {
        try {
          const delFilter: NostrFilter = { kinds: [5], authors: [...authorSet], limit: 500 };
          const delEvents = await nostr.query([delFilter], { signal });
          for (const d of delEvents) {
            for (const [name, value] of d.tags) {
              if (name === 'e' && value) deleted.add(value);
            }
          }
        } catch {
          // Deletion fetch failed — show posts rather than blank the feed.
        }
      }

      return events
        .filter((e) => !deleted.has(e.id))
        .map(parseCheckIn)
        .filter((c): c is BeerCheckIn => c !== null)
        .filter((c) => !deleted.has(c.id))
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 30_000,
  });
}

/** NIP-09 delete a check-in you authored. */
export function useDeleteCheckIn() {
  const publish = useNostrPublish();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (checkIn: { id: string }) =>
      publish.mutateAsync({
        kind: 5,
        content: 'Deleted from Beerbook',
        tags: [
          ['e', checkIn.id],
          ['client', 'beerbook'],
        ],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['beerbook-feed'] });
      qc.invalidateQueries({ queryKey: ['cheers'] });
    },
  });
}

/** Dedupe + latest helper. */
export function useCheckInAuthors(events: BeerCheckIn[]): string[] {
  return useMemo(() => Array.from(new Set(events.map((e) => e.pubkey))), [events]);
}
