import type { BeerRecord } from '@/lib/beers';

interface CatalogBeer {
  id: string | number;
  name: string;
  brewery?: { name?: string } | string;
  style?: { name?: string } | string;
  abv?: number | string;
  ibu?: number | string;
  description?: string;
  image_url?: string;
  image?: string;
}

/**
 * Catalog.beer access via Beerbook's proxy server (keeps the API key
 * server-side). Proxy base is configurable at build time via
 * VITE_CATALOG_PROXY (default: official Beerbook deployment).
 */
const PROXY_BASE = (import.meta.env.VITE_CATALOG_PROXY ?? 'https://catalog-proxy.beerbook.app').replace(/\/+$/, '');

export interface CatalogResult {
  available: boolean;
  beers: BeerRecord[];
  error?: string;
}

export async function searchCatalogBeers(query: string, signal?: AbortSignal): Promise<CatalogResult> {
  const q = query.trim();
  if (q.length < 2) return { available: true, beers: [] };

  const headers: Record<string, string> = { accept: 'application/json' };

  try {
    const res = await fetch(
      `${PROXY_BASE}/api/beer/search?q=${encodeURIComponent(q)}&count=20`,
      { headers, signal },
    );
    if (!res.ok) {
      // 400 = bad query, 429 = rate limited, 502/504 = upstream/proxy issue.
      return { available: false, beers: [], error: `catalog proxy: HTTP ${res.status}` };
    }
    const json = await res.json();
    const items: CatalogBeer[] = Array.isArray(json) ? json : (json.data ?? json.beers ?? []);
    const beers = items.map((b): BeerRecord => ({
      d: '',
      name: b.name,
      brewery: typeof b.brewery === 'string' ? b.brewery : (b.brewery?.name ?? ''),
      style: typeof b.style === 'string' ? b.style : (b.style?.name ?? undefined),
      abv: b.abv !== undefined && b.abv !== null ? String(b.abv) : undefined,
      ibu: b.ibu !== undefined && b.ibu !== null ? String(b.ibu) : undefined,
      description: b.description,
      image: b.image_url ?? b.image,
      eventId: `catalog:${b.id}`,
      pubkey: '',
      createdAt: 0,
      source: 'catalog.beer',
    }));
    return { available: true, beers };
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    return { available: false, beers: [], error: 'catalog.beer unreachable' };
  }
}
