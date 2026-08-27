import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { parseComment, type BeerComment, type CheckInRef, type CommentParent } from '@/lib/comments';

/** Max comments kept in memory / rendered after "show more". */
export const COMMENTS_PAGE = 20;

/**
 * Comments on a check-in: NIP-22 kind 1111 events scoped to the check-in.
 *
 * Queries both tag forms — clients that follow NIP-22 use the uppercase
 * `E` root tag, but plenty still emit only a lowercase `e` — then dedupes
 * and sorts oldest-first for a stable thread.
 */
export function useComments(checkInId?: string) {
  const { nostr } = useNostr();

  const query = useQuery({
    queryKey: ['comments', checkInId],
    enabled: !!checkInId,
    queryFn: async ({ signal }): Promise<BeerComment[]> => {
      const filters = [
        { kinds: [1111], '#E': [checkInId!], limit: 100 },
        { kinds: [1111], '#e': [checkInId!], limit: 100 },
      ];
      const events: NostrEvent[] = await nostr.query(filters, { signal });
      const seen = new Map<string, BeerComment>();
      for (const ev of events) {
        const c = parseComment(ev, checkInId!);
        if (c && !seen.has(c.id)) seen.set(c.id, c);
      }
      return [...seen.values()].sort((a, b) => a.createdAt - b.createdAt);
    },
  });

  return query;
}

/** Publish a NIP-22 comment (top-level on the check-in, or a reply to
 * another comment) via the app's standard publish path. */
export function useAddComment(checkIn: CheckInRef) {
  const publish = useNostrPublish();
  const { user } = useCurrentUser();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: { content: string; parent?: CommentParent }) => {
      if (!user) throw new Error('User is not logged in');
      const { buildCommentEvent } = await import('@/lib/comments');
      const template = buildCommentEvent({
        content: input.content,
        checkIn,
        parent: input.parent,
      });
      return publish.mutateAsync(template);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', checkIn.id] });
    },
  });

  return mutation;
}
