import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import { PageReader } from '@/components/PageReader';
import { LoginArea } from '@/components/auth/LoginArea';
import { useBeerbookFeed } from '@/hooks/useBeerbookFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollows } from '@/hooks/useUserSearch';
import { decodeNip19, profilePath } from '@/lib/nip19links';
import { cn } from '@/lib/utils';

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
  const navigate = useNavigate();

  // Home book = check-ins from people you follow (plus your own). 🌍 toggles the global book.
  const authorFilter = useMemo(() => {
    if (global || !user || !follows) return undefined;
    return Array.from(new Set([...follows, user.pubkey]));
  }, [global, user, follows]);

  const { data: checkIns, isLoading, isError, refetch } = useBeerbookFeed(
    authorFilter ? { authors: authorFilter } : undefined,
  );

  const startIndex = checkIns && deepLinkPage
    ? Math.max(0, checkIns.findIndex((c) => c.id === deepLinkPage))
    : 0;

  const feedLoading = isLoading || (!global && !!user && followsLoading);

  return (
    <div className="flex h-dvh flex-col bg-stone-900">
      {/* Top bar */}
      <header className="relative z-40 flex items-center justify-between border-b border-amber-900/60 bg-amber-950/95 px-4 py-2.5 backdrop-blur">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
        >
          <span className="font-serif text-xl font-bold text-amber-100">🍺 Beerbook</span>
        </button>
        <div className="flex items-center gap-2">
          {user && (
            <button
              type="button"
              onClick={() => setGlobal((v) => !v)}
              title={global ? 'Show only check-ins from people you follow' : 'Show every check-in on the network'}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                !global
                  ? 'border-amber-400 bg-amber-500 text-amber-950'
                  : 'border-amber-800 bg-transparent text-amber-200/80 hover:text-amber-100',
              )}
            >
              {global ? '🌍 Discover' : '🤝 My Crew'}
            </button>
          )}
          {user && (
            <Link
              to={profilePath(user.pubkey)}
              className="text-xs text-amber-200/80 underline-offset-2 hover:text-amber-100 hover:underline"
            >
              My Book
            </Link>
          )}
          <LoginArea />
          <button
            type="button"
            aria-label="New check-in"
            onClick={() => navigate('/new')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-amber-950 shadow transition hover:bg-amber-400"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* Reader */}
      <main className="relative flex-1 overflow-hidden">
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
          <PageReader checkIns={checkIns ?? []} startIndex={startIndex} />
        )}
      </main>

      {/* Hint */}
      <footer className="bg-amber-950 px-4 py-1 text-center text-[10px] text-amber-200/50">
        Swipe or use ← → to turn pages · Tap ⚡ to zap the author
      </footer>
    </div>
  );
}
