import { Link, useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { useBeerbookFeed } from '@/hooks/useBeerbookFeed';
import { BeerPage } from '@/components/BeerPage';
import { readerPath } from '@/lib/nip19links';

/** Profile: the user's check-ins as a book grid. */
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

  const metadata = author?.metadata;

  return (
    <div className="min-h-dvh bg-amber-50 pb-10">
      {/* Book cover header */}
      <div className="relative bg-gradient-to-br from-amber-800 via-amber-900 to-stone-900 px-6 pb-8 pt-10 text-center">
        <Link to="/" className="absolute left-3 top-3 text-xs text-amber-200/70 hover:text-amber-100">
          ← Back to your crew
        </Link>
        {metadata?.picture ? (
          <img
            src={metadata.picture}
            alt=""
            className="mx-auto h-20 w-20 rounded-full border-2 border-amber-400/50 object-cover shadow-lg"
          />
        ) : (
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber-400/50 bg-amber-950 text-3xl">
            🍺
          </div>
        )}
        <h1 className="mt-3 font-serif text-2xl font-bold text-amber-50">
          {metadata?.display_name || metadata?.name || (pubkey ? `${pubkey.slice(0, 12)}…` : 'Unknown')}
        </h1>
        {checkIns && (
          <p className="mt-1 text-sm text-amber-200/80">
            {checkIns.length} page{checkIns.length === 1 ? '' : 's'} ·{' '}
            {checkIns.length
              ? (checkIns.reduce((s, c) => s + c.rating, 0) / checkIns.length).toFixed(1)
              : '—'}{' '}
            ★ avg
          </p>
        )}
      </div>

      {/* Grid of pages */}
      <div className="mx-auto max-w-3xl p-4">
        {isLoading ? (
          <p className="py-10 text-center font-serif text-amber-800/70">Opening their book…</p>
        ) : !checkIns || checkIns.length === 0 ? (
          <div className="py-16 text-center">
            <span className="text-5xl">📖</span>
            <p className="mt-3 font-serif text-amber-900">No pages in this book yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {checkIns.map((c) => (
              <Link
                key={c.id}
                to={readerPath(c.id)}
                className="group block aspect-[3/4] overflow-hidden rounded-lg border-2 border-amber-200 shadow-md transition hover:-translate-y-1 hover:shadow-xl"
              >
                <BeerPage checkIn={c} interactive={false} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
