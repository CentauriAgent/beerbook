import type { BeerRecord } from '@/lib/beers';

interface CatalogBeer {
  id: string;
  name: string;
  brewer?: { name?: string } | string;
  style?: string;
  style_id?: string;
  abv?: number | string | null;
  ibu?: number | string | null;
  description?: string;
  description_english?: string;
  image?: { medium?: string; large?: string; original?: string } | string;
}

/**
 * Catalog.beer search.
 *
 * Uses the server-side proxy (VITE_CATALOG_PROXY, e.g. https://rosscitadel.com/catalog-api)
 * when configured — the proxy holds the API key and adds CORS headers, since
 * api.catalog.beer does not allow browser requests (preflight 401s).
 * VITE_CATALOG_BEER_KEY (direct, key-in-bundle) is a dev-only fallback.
 */
const API_BASE = 'https://api.catalog.beer';
const PROXY_BASE = (import.meta.env.VITE_CATALOG_PROXY as string | undefined)?.replace(/\/$/, '');
const API_KEY = import.meta.env.VITE_CATALOG_BEER_KEY as string | undefined;

export interface CatalogResult {
  available: boolean;
  beers: BeerRecord[];
  error?: string;
}

export async function searchCatalogBeers(query: string, signal?: AbortSignal): Promise<CatalogResult> {
  const q = query.trim();
  if (q.length < 2) return { available: true, beers: [] };

  const headers: Record<string, string> = { accept: 'application/json' };
  let url: string;
  if (PROXY_BASE) {
    url = `${PROXY_BASE}/beer/search?q=${encodeURIComponent(q)}&count=20`;
  } else {
    if (!API_KEY) return { available: false, beers: [], error: 'no catalog.beer key (set VITE_CATALOG_BEER_KEY)' };
    headers.authorization = `Basic ${btoa(`${API_KEY}:`)}`;
    url = `${API_BASE}/beer/search?q=${encodeURIComponent(q)}&count=20`;
  }

  try {
    const res = await fetch(url, {
      headers,
      signal,
    });
    if (!res.ok) {
      // 400 = bad query, 401/403 = key problem, 429 = rate limited.
      return { available: false, beers: [], error: `catalog.beer: HTTP ${res.status}` };
    }
    const json = await res.json();
    const items: CatalogBeer[] = Array.isArray(json) ? json : (json.data ?? []);
    const beers = items.map((b): BeerRecord => ({
      d: '',
      name: b.name,
      brewery: typeof b.brewer === 'string' ? b.brewer : (b.brewer?.name ?? ''),
      style: typeof b.style === 'string' ? b.style : undefined,
      abv: b.abv !== undefined && b.abv !== null ? String(b.abv) : undefined,
      ibu: b.ibu !== undefined && b.ibu !== null ? String(b.ibu) : undefined,
      description: b.description ?? b.description_english,
      image: typeof b.image === 'string' ? b.image : (b.image?.medium ?? b.image?.large),
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
