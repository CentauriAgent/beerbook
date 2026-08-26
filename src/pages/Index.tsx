import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import { PageReader } from '@/components/PageReader';
import { LoginArea } from '@/components/auth/LoginArea';
import { useBeerbookFeed } from '@/hooks/useBeerbookFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollows } from '@/hooks/useUserSearch';
import { cn } from '@/lib/utils';

export default function Index() {
  const [searchParams] = useSearchParams();
  const deepLinkPage = searchParams.get('page');

  useSeoMeta({
    title: 'Beerbook 🍺📖',
    description: 'Your drinking history as a beautiful, ownable book. A Nostr-native beer journal.',
  });

  const { data: checkIns, isLoading, isError, refetch } = useBeerbookFeed();
  const startIndex = checkIns && deepLinkPage
    ? Math.max(0, checkIns.findIndex((c) => c.id === deepLinkPage))
    : 0;
  const { user } = useCurrentUser();
  const { data: follows } = useFollows();
  const [trustedOnly, setTrustedOnly] = useState(false);
  const navigate = useNavigate();

  const visibleCheckIns = trustedOnly && follows
    ? checkIns?.filter((c) => follows.has(c.pubkey))
    : checkIns;

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
              onClick={() => setTrustedOnly((v) => !v)}
              title="Show only check-ins from people you follow"
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                trustedOnly
                  ? 'border-amber-400 bg-amber-500 text-amber-950'
                  : 'border-amber-800 bg-transparent text-amber-200/80 hover:text-amber-100',
              )}
            >
              🤝 Trusted{trustedOnly ? '' : ' · All'}
            </button>
          )}
          {user && (
            <Link
              to={`/u/${user.pubkey}`}
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
        {isLoading ? (
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
        ) : (
          <PageReader checkIns={visibleCheckIns ?? []} startIndex={startIndex} />
        )}
      </main>

      {/* Hint */}
      <footer className="bg-amber-950 px-4 py-1 text-center text-[10px] text-amber-200/50">
        Swipe or use ← → to turn pages · Tap ⚡ to zap the author
      </footer>
    </div>
  );
}
