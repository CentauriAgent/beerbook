import type { NostrEvent } from '@nostrify/nostrify';

export const BEER_KIND = 31006;

/** Beerbot's pubkey — its records are preferred when duplicates exist. */
export const BEERBOT_PUBKEY = '89bb8966cf7f756ed8dbad2027aa04b0151e5279aee3eb725109503a9fc836aa';

export interface BeerRecord {
  d: string; // slug: brewery-beer-name
  name: string;
  brewery: string;
  style?: string;
  style_id?: string; // catalog.beer style slug (e.g. "american-ipa")
  abv?: string;
  ibu?: string;
  description?: string;
  image?: string;
  eventId: string;
  pubkey: string;
  createdAt: number;
  source?: string;
}

/** slug(brewery-beer-name) for the d tag. */
export function beerSlug(name: string, brewery: string): string {
  const s = `${brewery} ${name}`.toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'unknown-beer';
}

export function parseBeerEvent(event: NostrEvent): BeerRecord | null {
  if (event.kind !== BEER_KIND) return null;
  const d = event.tags.find(([n]) => n === 'd')?.[1];
  if (!d) return null;
  const tag = (name: string) => event.tags.find(([n, v]) => n === name && v)?.[1];
  let image: string | undefined;
  const imeta = event.tags.find(([n]) => n === 'imeta');
  if (imeta) {
    image = imeta.slice(1).find((v) => v.startsWith('url '))?.slice(4);
  }
  image = image ?? tag('image');
  const contentDesc = event.content.trim();
  return {
    d,
    name: tag('name') ?? d,
    brewery: tag('brewery') ?? '',
    style: tag('style'),
    style_id: tag('style_id'),
    abv: tag('abv'),
    ibu: tag('ibu'),
    description: tag('description') || contentDesc || undefined,
    image,
    eventId: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    source: tag('source'),
  };
}

export function buildBeerEvent(input: {
  name: string;
  brewery: string;
  style?: string;
  style_id?: string;
  abv?: string;
  ibu?: string;
  description?: string;
  image?: string;
  source?: string;
}): { kind: number; content: string; tags: string[][] } {
  const d = beerSlug(input.name, input.brewery);
  const tags: string[][] = [
    ['d', d],
    ['name', input.name],
    ['client', 'beerbook'],
  ];
  if (input.brewery) tags.push(['brewery', input.brewery]);
  if (input.style) tags.push(['style', input.style]);
  if (input.style_id) tags.push(['style_id', input.style_id]);
  if (input.abv) tags.push(['abv', input.abv]);
  if (input.ibu) tags.push(['ibu', input.ibu]);
  if (input.image) tags.push(['image', input.image]);
  if (input.source) tags.push(['source', input.source]);
  if (input.description) tags.push(['description', input.description]);
  return {
    kind: BEER_KIND,
    content: input.description ?? '',
    tags,
  };
}

/** Rank duplicate beer records for the same d tag: Beerbot first, then newest. */
export function pickCanonicalBeer(records: BeerRecord[]): BeerRecord | undefined {
  if (records.length === 0) return undefined;
  const sorted = [...records].sort((a, b) => {
    if (a.pubkey === BEERBOT_PUBKEY && b.pubkey !== BEERBOT_PUBKEY) return -1;
    if (b.pubkey === BEERBOT_PUBKEY && a.pubkey !== BEERBOT_PUBKEY) return 1;
    return b.createdAt - a.createdAt;
  });
  return sorted[0];
}
