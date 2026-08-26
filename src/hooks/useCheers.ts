import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

export interface CheersData {
  count: number;
  reactors: { pubkey: string }[];
  mine: boolean;
}

/** Cheers: standard NIP-25 reactions (kind 7) with content 🍻 on a check-in event. */
export function useCheers(eventId?: string, author?: string) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['cheers', eventId],
    enabled: !!eventId,
    queryFn: async ({ signal }): Promise<CheersData> => {
      const events = await nostr.query([{ kinds: [7], '#e': [eventId!], limit: 200 }], { signal });
      // one reaction per pubkey (latest wins)
      const latest = new Map<string, number>();
      for (const ev of events) {
        const prev = latest.get(ev.pubkey);
        if (prev === undefined || ev.created_at >= prev) latest.set(ev.pubkey, ev.created_at);
      }
      const reactors = [...latest.keys()].map((pubkey) => ({ pubkey }));
      return {
        count: reactors.length,
        reactors,
        mine: !!user && latest.has(user.pubkey),
      };
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!eventId || !author) throw new Error('Missing event');
      return publish.mutateAsync({
        kind: 7,
        content: '🍻',
        tags: [
          ['e', eventId],
          ['p', author],
          ['client', 'beerbook'],
        ],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cheers', eventId] });
    },
  });

  return { ...query, mutation };
}
