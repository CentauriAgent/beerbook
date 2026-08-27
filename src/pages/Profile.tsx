import { Link, useParams } from 'react-router-dom';
import { useCallback } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { useBeerbookFeed } from '@/hooks/useBeerbookFeed';
import { BeerPage } from '@/components/BeerPage';
import { PullToRefresh } from '@/components/PullToRefresh';
import { readerPath } from '@/lib/nip19links';
import { profileStats } from './Profile.stats';

/** Profile: the cover of the user's book — aged leather, gold rule, first-page stats. */
export function Profile({ pubkey: propPubkey }: { pubkey?: string }) {
  const { npub } = useParams();
  let pubkey: string | undefined;
  if (propPubkey) {
    pubkey = propPubkey;
  } else {
    try {
      if (npub?.startsWith('npub1')) pubkey = nip19.decode(npub).data as string;
      else if (npub && /^[0-9a-f]{64}$/.test(npub)) pubkey = npub;
    } catch { /* invalid */ }
  }

  useSeoMeta({ title: pubkey ? 'Book — Beerbook 🍺📖' : 'Not found — Beerbook' });

  const { data: author } = useAuthor(pubkey);
  const { data: checkIns, isLoading } = useBeerbookFeed(pubkey ? { authors: [pubkey] } : undefined);

  const queryClient = useQueryClient();
  // Pull-to-refresh: invalidate the beerbook feed and re-render.
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['beerbook-feed'] }),
    [queryClient],
  );

  const metadata = author?.metadata;
  const stats = profileStats(checkIns);
  const name = metadata?.display_name || metadata?.name || (pubkey ? `${pubkey.slice(0, 12)}…` : 'Unknown');

  const statBlocks = [
    { label: 'Pages', value: String(stats.total) },
    { label: 'Avg rating', value: stats.avgRating !== null ? `★ ${stats.avgRating.toFixed(1)}` : '—' },
    { label: 'Breweries', value: stats.uniqueBreweries > 0 ? String(stats.uniqueBreweries) : '—' },
    { label: 'Fave style', value: stats.favoriteStyle ?? '—' },
  ];

  return (
    <PullToRefresh onRefresh={refresh}>
    <div className="min-h-dvh bg-amber-50 pb-10 dark:bg-stone-950">
      {/* Book cover header — aged leather with warm paper grain */}
      <div
        className="relative min-h-[40dvh] overflow-hidden bg-gradient-to-br from-amber-900 via-amber-950 to-stone-950 px-6 pb-10 pt-12 text-center dark:from-stone-950 dark:via-amber-950 dark:to-black"
      >
        {/* Paper grain overlay — separate layer so the Tailwind gradient survives */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(rgba(180,130,60,0.14) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />
        <Link
          to="/"
          className="absolute left-3 top-3 rounded px-2 py-1 text-xs text-amber-200/60 ring-1 ring-amber-200/20 transition hover:bg-amber-200/10 hover:text-amber-100"
        >
          ← Shelf
        </Link>

        {/* Embossed paper-framed avatar */}
        <div className="mx-auto mt-4 h-24 w-24 rounded-full bg-amber-50 p-1 shadow-[inset_0_2px_6px_rgba(0,0,0,0.45),0_3px_10px_rgba(0,0,0,0.5)]">
          {metadata?.picture ? (
            <img
              src={metadata.picture}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-full bg-amber-100 text-4xl">
              🍺
            </div>
          )}
        </div>

        <h1 className="mt-4 font-serif text-3xl font-bold tracking-wide text-amber-50 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
          {name}
        </h1>
        {metadata?.nip05 && (
          <p className="mt-1 text-xs text-amber-200/70">{metadata.nip05}</p>
        )}

        {/* Classic gold title-band rule */}
        <div className="mx-auto mt-3 h-px w-40 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
      </div>

      {/* First page of the book — stat row on cream */}
      <div className="mx-auto -mt-6 max-w-3xl px-4">
        <div className="grid grid-cols-4 gap-2 rounded-xl border border-amber-200 bg-amber-50/95 p-3 shadow-md dark:border-stone-700 dark:bg-stone-900/95">
          {statBlocks.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-[10px] font-medium uppercase tracking-widest text-amber-700 dark:text-amber-400/80">
                {s.label}
              </div>
              <div className="mt-1 truncate font-serif text-lg font-bold text-amber-950 dark:text-amber-100" title={s.value}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid of pages */}
      <div className="mx-auto max-w-3xl p-4">
        <h2 className="mb-3 text-center font-serif text-sm italic text-amber-800 dark:text-amber-300/80">
          Pages of this book
        </h2>
        {isLoading ? (
          <p className="py-10 text-center font-serif text-amber-800/70 dark:text-amber-200/70">Opening their book…</p>
        ) : !checkIns || checkIns.length === 0 ? (
          <div className="py-16 text-center">
            <span className="text-5xl">📖</span>
            <p className="mt-3 font-serif text-amber-900 dark:text-amber-200">No pages in this book yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {checkIns.map((c) => (
              <Link
                key={c.id}
                to={readerPath(c.id)}
                className="group block aspect-[3/4] overflow-hidden rounded-lg border-2 border-amber-200 shadow-md transition hover:-translate-y-1 hover:shadow-xl dark:border-stone-700"
              >
                <BeerPage checkIn={c} interactive={false} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
    </PullToRefresh>
  );
}
