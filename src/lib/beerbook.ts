import type { NostrEvent } from '@nostrify/nostrify';

export const FLAVORS = [
  'Malty', 'Sour', 'Roasty', 'Hoppy', 'Fruity', 'Spicy', 'Crisp', 'Sweet', 'Bitter',
  'Smoky', 'Tart', 'Funky', 'Boozy', 'Bready', 'Caramelly', 'Chocolatey', 'Coffee',
  'Vanilla', 'Oaky', 'Citrusy', 'Piney', 'Floral', 'Herbal', 'Grassy', 'Yeasty',
  'Earthy', 'Nutty', 'Salty', 'Juicy', 'Hazy', 'Dry', 'Refreshing',
] as const;
export type Flavor = (typeof FLAVORS)[number];

export const SERVINGS = ['draft', 'bottle', 'can', 'taster', 'cask'] as const;
export type Serving = (typeof SERVINGS)[number];

export interface BeerCheckIn {
  id: string;
  pubkey: string;
  beer: string;
  brewery: string;
  rating: number; // 0-5
  description: string;
  flavors: string[];
  serving?: string;
  location?: string;
  image?: string; // url
  taggedUsers: string[]; // pubkeys
  beerRef?: string; // d-slug or event-id of kind 31006 beer record
  beerAuthor?: string; // pubkey of the beer record author (for naddr links)
  createdAt: number;
}

/** Extract a Beerbook check-in from a kind 1 event. Returns null if not parseable. */
export function parseCheckIn(event: NostrEvent): BeerCheckIn | null {
  if (!event.tags.some(([name, value]) => (name === 't' || name === 'client') && value?.toLowerCase() === 'beerbook')) {
    // Fall back: hashtag in content
    if (!/#beerbook/i.test(event.content)) return null;
  }

  const tag = (name: string): string | undefined =>
    event.tags.find(([n, v]) => n === name && v !== undefined && v !== '')?.[1];

  const ratingStr = tag('rating');
  const rating = ratingStr !== undefined ? Math.min(5, Math.max(0, Number(ratingStr))) : NaN;
  const flavors = event.tags.filter(([n]) => n === 'flavor').map(([, v]) => v).filter(Boolean);
  const serving = tag('serving');
  const location = tag('location');
  const imeta = event.tags.find(([n]) => n === 'imeta');
  let image: string | undefined;
  if (imeta) {
    const url = imeta.slice(1).find((v) => v.startsWith('url '))?.slice(4);
    if (url) image = url;
  } else {
    const m = event.content.match(/https?:\/\/\S+\.(jpg|jpeg|png|webp|gif)\S*/i);
    if (m) image = m[0];
  }
  const taggedUsers = event.tags.filter(([n]) => n === 'p').map(([, v]) => v).filter(Boolean);
  const beerRef = tag('beer');
  const beerAuthor = tag('beer_pubkey');

  // Parse beer/brewery from structured tags first, then from content fallback.
  let beer = tag('beer_name');
 let brewery = tag('brewery');
  if (!beer) {
    const m = event.content.match(/Drinking\s+(.+?)(?:\s+by\s+(.+?))?(?:\s+[—-]\s*\d+(?:\.\d+?|\.\d+)?\s*★|\n|$)/);
    if (m) {
      beer = m[1];
      brewery = brewery ?? m[2];
    }
  }

  return {
    id: event.id,
    pubkey: event.pubkey,
    beer: beer ?? 'A Beer',
    brewery: brewery ?? '',
    rating: Number.isFinite(rating) ? rating : 0,
    description: event.content
      .replace(/https?:\/\/\S+\.(jpg|jpeg|png|webp|gif)\S*/i, '')
      .replace(/#\w+/g, '')
      .replace(/^\s*🍻?\s*/u, '')
      .replace(/🍺\s*Drinking\s+.+?(?:\n|$)/g, '')
      .replace(/Drinking\s+.+?(?:\n|$)/g, '')
      .replace(/^\s*[—-]\s*\d(?:\.\d)?\s*★\s*$/gm, '')
      .replace(/^\s*📍.*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    flavors,
    serving,
    location,
    image,
    taggedUsers,
    beerRef,
    beerAuthor,
    createdAt: event.created_at,
  };
}

export function buildCheckInEvent(input: {
  beer: string;
  brewery: string;
  rating: number;
  description: string;
  flavors: string[];
  serving?: string;
  location?: string;
  imageTags?: string[][]; // full imeta tags, e.g. [['imeta', 'url https://…', 'x abc…']]
  taggedUsers: string[];
  beerRef?: string; // event-id or d-slug of the beer record
  beerAuthor?: string; // pubkey of the beer record author (for naddr links)
}): { kind: 1; content: string; tags: string[][] } {
  const lines: string[] = [];
  lines.push(`🍺 Drinking ${input.beer}${input.brewery ? ` by ${input.brewery}` : ''} — ${input.rating}★`);
  if (input.description.trim()) {
    lines.push('');
    lines.push(input.description.trim());
  }
  if (input.location) lines.push(`\n📍 ${input.location}`);
  // Include the image URL in the content itself — many clients only render
  // images whose URL appears in the text (imeta alone is not enough).
  for (const imeta of input.imageTags ?? []) {
    const url = imeta.slice(1).find((v) => v.startsWith('url '))?.slice(4);
    if (url) lines.push(`\n${url}`);
  }
  lines.push('\n#beerbook');

  const tags: string[][] = [
    ['t', 'beerbook'],
    ['client', 'beerbook'],
    ['rating', String(input.rating)],
  ];
  if (input.brewery) tags.push(['brewery', input.brewery]);
  if (input.beerRef) tags.push(['beer', input.beerRef]);
  if (input.beerAuthor) tags.push(['beer_pubkey', input.beerAuthor]);
  tags.push(['beer_name', input.beer]);
  for (const f of input.flavors) tags.push(['flavor', f.toLowerCase()]);
  if (input.serving) tags.push(['serving', input.serving]);
  if (input.location) tags.push(['location', input.location]);
  for (const imeta of input.imageTags ?? []) tags.push(['imeta', ...imeta.slice(1)]);
  for (const p of input.taggedUsers) tags.push(['p', p]);

  return { kind: 1, content: lines.join('\n'), tags };
}

export const BEERBOOK_RELAYS = [
  'wss://relay.ditto.pub/',
  'wss://relay.primal.net/',
  'wss://nos.lol/',
];
