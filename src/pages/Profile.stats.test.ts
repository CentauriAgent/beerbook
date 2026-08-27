import { describe, expect, it } from 'vitest';
import type { BeerCheckIn } from '@/lib/beerbook';
import { profileStats } from './Profile.stats';

const ci = (over: Partial<BeerCheckIn>): BeerCheckIn => ({
  id: Math.random().toString(36).slice(2),
  pubkey: 'a'.repeat(64),
  beer: 'Beer',
  brewery: '',
  rating: 0,
  description: '',
  flavors: [],
  taggedUsers: [],
  createdAt: 0,
  ...over,
});

describe('profileStats', () => {
  it('handles empty/undefined feed', () => {
    expect(profileStats(undefined)).toEqual({
      total: 0,
      avgRating: null,
      uniqueBreweries: 0,
      favoriteStyle: null,
    });
    expect(profileStats([]).total).toBe(0);
  });

  it('computes total, avg rating (unrated excluded), unique breweries', () => {
    const stats = profileStats([
      ci({ rating: 4, brewery: 'Founders' }),
      ci({ rating: 5, brewery: 'founders ' }), // case/whitespace-insensitive dedupe
      ci({ rating: 3, brewery: 'Tree House' }),
      ci({ rating: 0, brewery: 'Founders' }), // unrated → excluded from avg
    ]);
    expect(stats.total).toBe(4);
    expect(stats.avgRating).toBeCloseTo(4);
    expect(stats.uniqueBreweries).toBe(2);
  });

  it('avgRating is null when nothing is rated', () => {
    expect(profileStats([ci({ rating: 0 })]).avgRating).toBeNull();
  });

  it('favorite style = most common flavor tag, title-cased, deterministic ties', () => {
    const stats = profileStats([
      ci({ flavors: ['hoppy', 'citrusy'] }),
      ci({ flavors: ['Hoppy'] }),
      ci({ flavors: ['roasty', 'hoppy'] }),
      ci({ flavors: ['Roasty'] }), // tie with hoppy (3-3) → alphabetical → hoppy
    ]);
    expect(stats.favoriteStyle).toBe('Hoppy');
  });

  it('favoriteStyle null when no flavors tagged', () => {
    expect(profileStats([ci({}), ci({ flavors: [] })]).favoriteStyle).toBeNull();
  });
});
