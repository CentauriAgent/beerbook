import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { parseBeerEvent, pickCanonicalBeer, type BeerRecord } from '@/lib/beers';
import { searchCatalogBeers } from '@/lib/catalogBeer';

export interface BeerSearchResult {
  beers: BeerRecord[];
  source: 'nostr' | 'catalog' | 'merged';
  catalogUnavailable?: boolean;
}

/**
 * Search the decentralized beer inventory:
 * 1. Nostr: NIP-50 search on search-enabled relays + #d single-char lookups + Beerbot records.
 * 2. Fallback: catalog.beer REST API (long tail).
 * Merged + deduped, cached by TanStack Query.
 */
export function useBeerSearch(query: string) {
  const { nostr } = useNostr();
  const q = query.trim();

  return useQuery<BeerSearchResult>({
    queryKey: ['beer-search', q.toLowerCase()],
    enabled: q.length >= 2,
    staleTime: 300_000,
    queryFn: async ({ signal }) => {
      const slugish = q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

      // 1a. NIP-50 search across kinds 31006
      const nostrResults = await nostr
        .query([{ kinds: [31006], search: q, limit: 30 }], { signal: AbortSignal.timeout(4000) })
        .catch(() => []);

      // 1b. Exact #d lookup
      const byD = slugish
        ? await nostr
            .query([{ kinds: [31006], '#d': [slugish], limit: 10 }], { signal: AbortSignal.timeout(4000) })
            .catch(() => [])
        : [];

      const nostrBeers = [...nostrResults, ...byD]
        .map(parseBeerEvent)
        .filter((b): b is BeerRecord => b !== null);

      // Dedupe by d tag, prefer canonical records
      const bySlug = new Map<string, BeerRecord[]>();
      for (const b of nostrBeers) {
        const list = bySlug.get(b.d) ?? [];
        list.push(b);
        bySlug.set(b.d, list);
      }
      const deduped = Array.from(bySlug.values())
        .map((list) => pickCanonicalBeer(list)!)
        .filter(Boolean);

      // 2. catalog.beer fallback (skip beers already on Nostr)
      const catalog = await searchCatalogBeers(q, signal);
      const existing = new Set(deduped.map((b) => `${b.brewery.toLowerCase()}|${b.name.toLowerCase()}`));
      const catalogNew = catalog.beers.filter(
        (b) => !existing.has(`${b.brewery.toLowerCase()}|${b.name.toLowerCase()}`),
      );

      return {
        beers: [...deduped, ...catalogNew],
        source: deduped.length && catalogNew.length ? 'merged' : deduped.length ? 'nostr' : 'catalog',
        catalogUnavailable: !catalog.available,
      };
    },
  });
}

/** Look up the canonical record by d slug (optionally scoped to the naddr author) or 31006 event id. */
export function useBeerBySlug(ref: string | undefined, author?: string) {
  const { nostr } = useNostr();

  return useQuery<BeerRecord | undefined>({
    queryKey: ['beer', ref ?? '', author ?? ''],
    enabled: !!ref,
    staleTime: 300_000,
    queryFn: async () => {
      const isId = /^[0-9a-f]{64}$/.test(ref!);
      const base: any = isId
        ? { kinds: [31006], ids: [ref!], limit: 20 }
        : author
          ? { kinds: [31006], authors: [author], '#d': [ref!], limit: 20 }
          : { kinds: [31006], '#d': [ref!], limit: 20 };
      const events = await nostr.query([base], { signal: AbortSignal.timeout(5000) });
      return pickCanonicalBeer(events.map(parseBeerEvent).filter(Boolean) as BeerRecord[]);
    },
  });
}
