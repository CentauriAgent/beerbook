import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { PageReader } from '@/components/PageReader';
import { useBeerbookFeed } from '@/hooks/useBeerbookFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollows } from '@/hooks/useUserSearch';
import { decodeNip19 } from '@/lib/nip19links';

export default function Index() {
  const [searchParams] = useSearchParams();
  const deepLinkPage = (() => {
    const p = searchParams.get('page');
    if (!p) return undefined;
    if (/^[0-9a-f]{64}$/.test(p)) return p; // legacy hex deep link
    const decoded = decodeNip19(p);
    return decoded && (decoded.type === 'note' || decoded.type === 'nevent') ? decoded.eventId : undefined;
  })();

  useSeoMeta({
    title: 'Beerbook 🍺📖',
    description: 'Your drinking history as a beautiful, ownable book. A Nostr-native beer journal.',
  });

  const { user } = useCurrentUser();
  const { data: follows, isLoading: followsLoading } = useFollows();
  const [global, setGlobal] = useState(false);

  // Home book = check-ins from people you follow (plus your own). 🌍 toggles the global book.
  const authorFilter = useMemo(() => {
    if (global || !user || !follows) return undefined;
    return Array.from(new Set([...follows, user.pubkey]));
  }, [global, user, follows]);

  const { data: checkIns, isLoading, isError, refetch } = useBeerbookFeed(
    authorFilter ? { authors: authorFilter } : undefined,
  );

  const queryClient = useQueryClient();
  // Pull-to-refresh: invalidate + await the feed refetch (prefix key covers
  // both the crew and global variants). PageReader keeps the current page.
  const refreshFeed = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['beerbook-feed'] }),
    [queryClient],
  );

  const startIndex = checkIns && deepLinkPage
    ? Math.max(0, checkIns.findIndex((c) => c.id === deepLinkPage))
    : 0;

  const feedLoading = isLoading || (!global && !!user && followsLoading);

  return (
    <div className="relative h-dvh overflow-hidden bg-stone-900">
      {/* Reader — fills the whole viewport; nav floats over it */}
      <main className="absolute inset-0">
      {feedLoading ? (
          <div className="flex h-full items-center justify-center bg-amber-950">
            <div className="animate-pulse text-center">
              <span className="text-5xl">📖</span>
              <p className="mt-3 font-serif text-amber-200/70">Opening the book…</p>
            </div>
          </div>
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-amber-950 px-6 text-center">
            <span className="text-4xl">🕳️</span>
            <p className="font-serif text-amber-200">Couldn't reach the relays.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-amber-950"
            >
              Try again
            </button>
          </div>
        ) : !global && user && checkIns && checkIns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-amber-950 px-6 text-center">
            <span className="text-4xl">📖</span>
            <p className="font-serif text-amber-200">Your crew hasn't written any pages yet.</p>
            <p className="text-xs text-amber-200/60">Follow more beer lovers on Nostr, or explore the global book.</p>
            <button
              type="button"
              onClick={() => setGlobal(true)}
              className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-amber-950"
            >
              🌍 Discover the global book
            </button>
          </div>
        ) : (
          <PageReader checkIns={checkIns ?? []} startIndex={startIndex} onRefresh={refreshFeed} />
        )}
      </main>

      {/* Floating top nav — fully transparent over the photo, with a subtle
          gradient scrim (matches the bottom overlay) so controls stay readable
          over bright photos. Safe-area inset keeps it clear of the iOS notch. */}
      <header className="pointer-events-none absolute left-0 top-0 z-40 w-2/3 bg-gradient-to-r from-black/20 via-black/5 to-transparent -translate-y-2 pt-[env(safe-area-inset-top)] pb-3">
        <div className="pointer-events-none flex items-center justify-between px-4 py-2.5">
          <span className="pointer-events-auto flex items-center gap-2">
            {user && (
              <button
                type="button"
                onClick={() => setGlobal((v) => !v)}
                aria-label={global ? 'Switch to My Crew feed' : 'Switch to global feed'}
                title={global ? 'My Crew feed' : 'Global feed'}
                className="flex h-9 w-9 items-center justify-center rounded-full text-2xl drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition hover:scale-110 active:scale-90"
              >
                {global ? '🌍' : '🍺'}
              </button>
            )}
            <button
              type="button"
              onClick={() => refetch()}
              aria-label="Refresh the book feed"
              title="Refresh feed"
              className="font-serif text-xl font-bold text-amber-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition hover:opacity-80 active:scale-95"
            >
              Beerbook
            </button>
          </span>
          <span />
        </div>
      </header>
    </div>
  );
}
