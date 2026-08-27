import type { BeerCheckIn } from '@/lib/beerbook';

/** Aggregated stats for a user's book, computed purely from their check-ins. */
export interface ProfileStats {
  total: number;
  avgRating: number | null; // null when no rated check-ins
  uniqueBreweries: number;
  /** Most common flavor/style tag across check-ins (null when none tagged). */
  favoriteStyle: string | null;
}

/**
 * Compute profile stats from check-ins.
 *
 * Check-in events (see buildCheckInEvent in lib/beerbook.ts) carry no dedicated
 * `style` tag — beer *records* (kind 31006) hold the style, not the check-in.
 * The closest style signal on the check-in itself is the multi-value `flavor`
 * tag, so "favorite style" = most common flavor, tie-broken alphabetically for
 * determinism.
 */
export function profileStats(checkIns: BeerCheckIn[] | undefined): ProfileStats {
  if (!checkIns || checkIns.length === 0) {
    return { total: 0, avgRating: null, uniqueBreweries: 0, favoriteStyle: null };
  }

  const rated = checkIns.filter((c) => c.rating > 0);
  const avgRating = rated.length
    ? rated.reduce((s, c) => s + c.rating, 0) / rated.length
    : null;

  const breweries = new Set(
    checkIns.map((c) => c.brewery.trim().toLowerCase()).filter(Boolean),
  );

  const counts = new Map<string, number>();
  for (const c of checkIns) {
    for (const f of c.flavors) {
      const key = f.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let favoriteStyle: string | null = null;
  let best = -1;
  for (const [flavor, n] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (n > best) {
      best = n;
      favoriteStyle = flavor;
    }
  }
  if (favoriteStyle) {
    favoriteStyle = favoriteStyle.charAt(0).toUpperCase() + favoriteStyle.slice(1);
  }

  return {
    total: checkIns.length,
    avgRating,
    uniqueBreweries: breweries.size,
    favoriteStyle,
  };
}
