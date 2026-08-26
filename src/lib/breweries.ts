/**
 * Brewery name normalization + "did you mean" suggestions.
 * Kept intentionally small and offline: a curated list of frequently
 * seen breweries (craft + macro) with common shorthand/misspellings.
 */

/** Well-known breweries keyed by canonical name; values are accepted variants. */
const KNOWN_BREWERIES: Record<string, string[]> = {
  'Dogfish Head': ['dogfish', 'dogfishhead', 'dogfish head craft brewery'],
  'Sierra Nevada': ['sierra', 'sierra nevada brewing co'],
  'Stone Brewing': ['stone', 'stone brewing co', 'stone brewery'],
  'Bell\u2019s Brewery': ['bells', "bell's", 'bells brewery', 'eccentric cafe'],
  'Founders Brewing': ['founders', 'founders brewing co'],
  'Russian River': ['russian river brewing', 'rrbc'],
  'The Alchemist': ['alchemist', 'alchemist beer'],
  'Tree House Brewing': ['treehouse', 'tree house', 'tree house brewing co'],
  'Trillium Brewing': ['trillium', 'trillium brewing company'],
  'Hill Farmstead': ['hill farmstead brewery'],
  'Cantillon': ['brasserie cantillon'],
  'Rochefort': ['brasserie de rochefort', 'rochefort brewery'],
  'Westmalle': ['brouwerij westmalle', 'trappist westmalle'],
  'Chimay': ['brasserie de chimay', 'chimay brewery'],
  'Weihenstephaner': ['bayerische staatsbrauerei weihenstephan', 'weihenstephan'],
  'Ayinger': ['ayinger privatbrauerei', 'brauerei ayinger'],
  'Samuel Adams': ['boston beer company', 'sam adams', 'samuel adams boston lager'],
  'New Belgium': ['new belgium brewing', 'new belgium brewing company'],
  'Oskar Blues': ['oscar blues', 'oskar blues brewery'],
  'Great Lakes': ['great lakes brewing co', 'great lakes brewing company'],
  'Boulevard Brewing': ['boulevard', 'boulevard beer'],
  'Deschutes': ['deschutes brewery'],
  'Rogue': ['rogue ales', 'rogue brewing'],
  'Lagunitas': ['lagunitas brewing company'],
  'Victory Brewing': ['victory', 'victory beer'],
  'Troegs Brewing': ['troegs', 'troegs independent brewing'],
  'Weyerbacher': ['weyerbacher brewing'],
  'Selin\u2019s Grove': ['selins grove', "selin's grove brewing"],
  'Duquesne': ['duquesne brewing'],
  'Voodoo Brewery': ['voodoo', 'voodoo brewing company'],
  'Rodders Pub': ['rodders'],
};

const SUFFIX_FIXES: Array<[RegExp, string]> = [
  [/\bbrewing\s+company\b|\bbrewing\s+co[.]?\b|\bbrewery\b|\bbeer\s+co[.]?\b/gi, ''],
];

/**
 * Normalize a brewery name: trim, collapse whitespace, strip trailing
 * punctuation, and drop redundant legal/brewing suffixes unless the name
 * would become empty.
 */
export function normalizeBrewery(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ');
  s = s.replace(/[.,;:]+$/, '');
  for (const [re] of SUFFIX_FIXES) {
    const stripped = s.replace(re, '').trim().replace(/\s+/g, ' ');
    if (stripped.length >= 3) s = stripped;
  }
  // Re-title-case ALL-CAPS shouting without breaking McDonald's-style names
  if (s === s.toUpperCase() && s.length > 3) {
    s = s.toLowerCase().replace(/(^|[\s'\u2019-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
  }
  return s;
}

/**
 * Return a canonical brewery name if `raw` looks like a known variant
 * (common shorthand or misspelling), else undefined.
 */
export function breweryWarning(raw: string): string | undefined {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return undefined;
  for (const [canonical, variants] of Object.entries(KNOWN_BREWERIES)) {
    if (variants.includes(key) || canonical.toLowerCase() === key) {
      return canonical;
    }
  }
  return undefined;
}
