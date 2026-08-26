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
 * catalog.beer REST client. Basic search is unauthenticated per their docs;
 * a key (if present) enables full results via HTTP basic auth.
 * Key resolution: localStorage `beerbook:catalog-key` → VITE_CATALOG_BEER_KEY.
 */
function catalogKey(): string | null {
  try {
    return localStorage.getItem('beerbook:catalog-key') || (import.meta.env.VITE_CATALOG_BEER_KEY ?? null);
  } catch {
    return import.meta.env.VITE_CATALOG_BEER_KEY ?? null;
  }
}

export interface CatalogResult {
  available: boolean;
  beers: BeerRecord[];
  error?: string;
}

export async function searchCatalogBeers(query: string, signal?: AbortSignal): Promise<CatalogResult> {
  const q = query.trim();
  if (q.length < 2) return { available: true, beers: [] };

  const headers: Record<string, string> = { accept: 'application/json' };
  const key = catalogKey();
  if (key) headers['authorization'] = `Basic ${btoa(`${key}:`)}`;

  try {
    const res = await fetch(
      `https://api.catalog.beer/v1/beers?search=${encodeURIComponent(q)}&per_page=20`,
      { headers, signal },
    );
    if (!res.ok) {
      // 401/403 = key required, 404 = endpoint changed. Degrade gracefully.
      return { available: false, beers: [], error: `catalog.beer: HTTP ${res.status}` };
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
