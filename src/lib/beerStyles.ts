import stylesJson from '@/data/beer-styles.json';

export interface BeerStyleSrm {
  min: number | null;
  max: number | null;
}

export interface BeerStyle {
  id: string; // slug, e.g. "american-ipa"
  name: string;
  beverage_type: string;
  parent: string | null;
  class: string | null;
  catch_all: boolean;
  aliases: string[];
  srm: BeerStyleSrm | null;
}

export const BEER_STYLES: BeerStyle[] = (stylesJson as { data: BeerStyle[] }).data;

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const byId = new Map(BEER_STYLES.map((s) => [s.id, s]));

export function styleById(id: string): BeerStyle | undefined {
  return byId.get(id);
}

/** Exact-ish match on name or alias (case/diacritic/punctuation-insensitive). */
export function matchStyle(query: string): BeerStyle | undefined {
  const q = normalize(query);
  if (!q) return undefined;
  return BEER_STYLES.find(
    (s) => normalize(s.name) === q || s.aliases.some((a) => normalize(a) === q),
  );
}

/** Fuzzy match: token-subset match on name/aliases, prefers specific over catch_all. */
export function fuzzyMatchStyle(query: string): BeerStyle | undefined {
  const exact = matchStyle(query);
  if (exact) return exact;
  const q = normalize(query);
  if (!q) return undefined;
  const tokens = q.split(' ');
  const contains = (haystack: string) => {
    const h = normalize(haystack);
    return tokens.every((t) => h.includes(t));
  };
  const candidates = BEER_STYLES.filter((s) => contains(s.name) || s.aliases.some(contains));
  // Prefer specific styles, then longest name (most specific match), then alphabetical
  return candidates.sort((a, b) => {
    if (a.catch_all !== b.catch_all) return a.catch_all ? 1 : -1;
    if (b.name.length !== a.name.length) return b.name.length - a.name.length;
    return a.name.localeCompare(b.name);
  })[0];
}

export interface StyleSearchResult {
  style: BeerStyle;
  /** Human-readable grouping label, e.g. "IPA > American-Style IPA" */
  group: string;
}

/** Search styles by name + aliases. Results grouped heading is parent/class derived. */
export function searchStyles(query: string, limit = 50): StyleSearchResult[] {
  const q = normalize(query);
  const scored = BEER_STYLES.filter((s) => {
    if (!q) return true;
    return normalize(s.name).includes(q) || s.aliases.some((a) => normalize(a).includes(q));
  }).map((style) => ({ style, group: styleGroupLabel(style) }));
  // Specific styles first, then alphabetical
  scored.sort((a, b) => {
    if (a.style.catch_all !== b.style.catch_all) return a.style.catch_all ? 1 : -1;
    return a.style.name.localeCompare(b.style.name);
  });
  return scored.slice(0, limit);
}

/** "IPA > American-Style India Pale Ale" style label: parent group, fallback class. */
export function styleGroupLabel(style: BeerStyle): string {
  const parent = style.parent ? byId.get(style.parent)?.name : undefined;
  if (parent && parent !== style.name) {
    return `${parent} > ${style.name}`;
  }
  if (style.class) {
    const cls = style.class.charAt(0).toUpperCase() + style.class.slice(1);
    return `${cls} > ${style.name}`;
  }
  return style.name;
}

/** "4–12" | "40+" | "≤8" | null — for the SRM hint. */
export function srmRangeLabel(style: BeerStyle): string | null {
  const srm = style.srm;
  if (!srm) return null;
  const { min, max } = srm;
  if (min != null && max != null) return `${min}–${max}`;
  if (min != null) return `${min}+`;
  if (max != null) return `≤${max}`;
  return null;
}
