import { describe, expect, it } from 'vitest';
import { BEER_KIND, buildBeerEvent, beerSlug } from './beers';

describe('buildBeerEvent d-tag preservation', () => {
  it('derives the d tag from name+brewery when no explicit d is given', () => {
    const t = buildBeerEvent({ name: 'Pliny the Elder', brewery: 'Russian River' });
    expect(t.kind).toBe(BEER_KIND);
    expect(t.tags.find(([n]) => n === 'd')?.[1]).toBe(beerSlug('Pliny the Elder', 'Russian River'));
  });

  it('preserves an explicit d tag even when name/brewery are edited', () => {
    const originalD = 'russian-river-pliny-the-elder';
    const t = buildBeerEvent({
      name: 'Pliny the Elder (2026 batch)',
      brewery: 'Russian River Brewing Co.',
      d: originalD,
    });
    expect(t.tags.find(([n]) => n === 'd')?.[1]).toBe(originalD);
    // the derived slug would differ — proving the explicit d takes precedence
    expect(t.tags.find(([n]) => n === 'd')?.[1]).not.toBe(
      beerSlug('Pliny the Elder (2026 batch)', 'Russian River Brewing Co.'),
    );
  });

  it('includes edited fields in tags', () => {
    const t = buildBeerEvent({
      name: 'New Name',
      brewery: 'New Brewery',
      style: 'Stout',
      abv: '9.0',
      ibu: '40',
      description: 'desc',
      image: 'https://example.com/x.jpg',
      source: 'catalog.beer',
      d: 'old-slug',
    });
    const tag = (n: string) => t.tags.find(([x]) => x === n)?.[1];
    expect(tag('d')).toBe('old-slug');
    expect(tag('name')).toBe('New Name');
    expect(tag('brewery')).toBe('New Brewery');
    expect(tag('style')).toBe('Stout');
    expect(tag('abv')).toBe('9.0');
    expect(tag('ibu')).toBe('40');
    expect(tag('description')).toBe('desc');
    expect(tag('image')).toBe('https://example.com/x.jpg');
    expect(tag('source')).toBe('catalog.beer');
  });
});
