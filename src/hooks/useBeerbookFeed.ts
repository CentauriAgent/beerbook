import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { NSchema } from '@nostrify/nostrify';
import { parseCheckIn, type BeerCheckIn } from '@/lib/beerbook';

/** Subscribe to #beerbook kind 1 events. */
export function useBeerbookFeed(opts?: { authors?: string[] }) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['beerbook-feed', opts?.authors ?? ['global']],
    queryFn: async ({ signal }) => {
      const filter: NostrFilter = { kinds: [1], '#t': ['beerbook'], limit: 100 };
      if (opts?.authors) filter.authors = opts.authors;
      const events = await nostr.query([filter], { signal });
      return events
        .filter((e) => NSchema.id().safeParse(e.id).success)
        .map(parseCheckIn)
        .filter((c): c is BeerCheckIn => c !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 30_000,
  });
}

/** Dedupe + latest helper. */
export function useCheckInAuthors(events: BeerCheckIn[]): string[] {
  return useMemo(() => Array.from(new Set(events.map((e) => e.pubkey))), [events]);
}
