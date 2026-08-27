import { memo, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Maximize2, Minimize2, Plus, Share2, Trash2, Zap } from 'lucide-react';
import { StarRating } from '@/components/StarRating';
import { useZap } from '@/hooks/useZap';
import { Comments } from '@/components/Comments';
import { useCheers } from '@/hooks/useCheers';
import { useDeleteCheckIn } from '@/hooks/useBeerbookFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import type { BeerCheckIn } from '@/lib/beerbook';
import { beerPath, profilePath, readerPath } from '@/lib/nip19links';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { useNostrLogin } from '@nostrify/react/login';
import { LogOut, Menu } from 'lucide-react';

interface BeerPageProps {
  checkIn: BeerCheckIn;
  interactive?: boolean; // enable zap/maximize buttons
}

/** A single book "page": full-bleed photo + overlay. Memoized so the
 * per-frame drag/spring re-renders in PageReader skip this whole subtree
 * (props only change when the base check-in actually changes). */
export const BeerPage = memo(function BeerPage({ checkIn, interactive = true }: BeerPageProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const { removeLogin } = useLoggedInAccounts();
  const { logins } = useNostrLogin();
  const zap = useZap();
  const cheers = useCheers(checkIn.id, checkIn.pubkey);
  const { user } = useCurrentUser();
  const { data: me } = useAuthor(user?.pubkey ?? '');
  const meAvatar = me?.metadata?.picture;
  const del = useDeleteCheckIn();
  const isMine = !!user && user.pubkey === checkIn.pubkey;
  const { data: author } = useAuthor(checkIn.pubkey);
  const metadata = author?.metadata;

  const avatar = useMemo(() => {
    if (metadata?.picture) return metadata.picture;
    return undefined;
  }, [metadata?.picture]);

  const beerLink = beerPath(checkIn.beerRef, checkIn.beerAuthor);

  const share = async () => {
    const url = `${window.location.origin}${readerPath(checkIn.id)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${checkIn.beer} — Beerbook`, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* user cancelled */ }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-amber-950 select-none">
      {/* Full-bleed photo */}
      {checkIn.image ? (
        <img
          src={checkIn.image}
          alt={`${checkIn.beer} by ${checkIn.brewery}`}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-900 via-amber-800 to-stone-900">
          <span className="text-8xl opacity-40">🍺</span>
        </div>
      )}

      {/* Bottom gradient overlay */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 transition-all duration-500',
          expanded
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-full opacity-0',
        )}
      >
        <div className="bg-gradient-to-t from-black/90 via-black/60 to-transparent px-5 pb-[calc(3.5rem+env(safe-area-inset-bottom))] pt-24">
          <div className="flex flex-col gap-1.5">
              <div className="min-w-0">
                {beerLink ? (
                  <Link
                    to={beerLink}
                    onClick={(e) => e.stopPropagation()}
                    className="text-2xl font-bold leading-tight text-white drop-shadow-lg underline-offset-4 hover:underline"
                  >
                    {checkIn.beer}
                  </Link>
                ) : (
                  <h2 className="text-2xl font-bold leading-tight text-white drop-shadow-lg">
                    {checkIn.beer}
                  </h2>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {checkIn.brewery && (
                  <p className="min-w-0 truncate font-serif text-base italic text-amber-200">{checkIn.brewery}</p>
                )}
                <StarRating value={checkIn.rating} size={26} className="ml-auto shrink-0" />
              </div>
            </div>

          {checkIn.description && (
            <p className="mt-2 line-clamp-3 font-serif text-sm leading-relaxed text-amber-50/90">
              {checkIn.description}
            </p>
          )}

          {/* Flavor chips */}
          {checkIn.flavors.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {checkIn.flavors.map((f) => (
                <span
                  key={f}
                  className="rounded-full border border-amber-400/40 bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium capitalize text-amber-100 backdrop-blur-sm"
                >
                  {f}
                </span>
              ))}
            </div>
          )}

          {/* Serving + location + tagged users */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-amber-100/80">
            {checkIn.serving && (
              <span className="flex items-center gap-1">
                <span className="opacity-70">Served:</span>
                <span className="font-medium capitalize text-amber-50">{checkIn.serving}</span>
              </span>
            )}
            {checkIn.location && (
              <span className="flex items-center gap-1">📍 {checkIn.location}</span>
            )}
            {checkIn.taggedUsers.length > 0 && (
              <span className="flex items-center -space-x-1.5">
                {checkIn.taggedUsers.slice(0, 5).map((p) => (
                  <TaggedAvatar key={p} pubkey={p} />
                ))}
              </span>
            )}
          </div>

          {/* Author row */}
          {interactive && (
            <div className="mt-3 flex items-center">
              <Link
                to={profilePath(checkIn.pubkey)}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2 text-xs text-amber-100/80 hover:text-amber-50"
              >
                {avatar ? (
                  <img src={avatar} alt="" className="h-6 w-6 rounded-full border border-amber-400/40 object-cover" />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-800 text-[10px]">🍺</div>
                )}
                <span>{metadata?.display_name || metadata?.name || `${checkIn.pubkey.slice(0, 8)}…`}</span>
              </Link>
              <div className="ml-auto">
                <Comments checkIn={checkIn} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top-right FAB: logged-in user's avatar (tap to expand actions);
          logged-out users get a plain Join button — browse only. */}
      {interactive && user && (
        <div className="absolute right-3 top-[calc(0.2rem+env(safe-area-inset-top))] z-50 flex flex-col items-end gap-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            aria-label={menuOpen ? 'Hide actions' : 'Show actions'}
            aria-expanded={menuOpen}
            className="relative transition active:scale-90"
          >
            {meAvatar ? (
              <img src={meAvatar} alt="" className="h-10 w-10 rounded-full border-2 border-amber-300 object-cover shadow-lg" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-300 bg-amber-800 text-lg shadow-lg">🍺</div>
            )}
            <span className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-amber-950 ring-2 ring-amber-950/80 shadow-md">
              <Menu size={12} strokeWidth={2.75} />
            </span>
          </button>

          {menuOpen && (
            <div className='flex flex-col items-end gap-3 animate-scale-in'>
              {/* Fullscreen photo toggle */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                aria-label={expanded ? 'Maximize photo' : 'Show details'}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:scale-110 active:scale-90"
              >
                {expanded ? <Maximize2 size={22} /> : <Minimize2 size={22} />}
              </button>

              {/* New check-in */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate('/new'); }}
                aria-label="New check-in"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500 text-amber-950 transition hover:scale-110 active:scale-90"
              >
                <Plus size={24} strokeWidth={2.5} />
              </button>

              {/* Cheers */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!cheers.data?.mine) cheers.mutation.mutate();
                }}
                disabled={cheers.mutation.isPending || cheers.data?.mine}
                title={cheers.data?.mine ? 'You cheered this 🍻' : 'Cheers! 🍻'}
                className="flex flex-col items-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition hover:scale-110 active:scale-90 disabled:opacity-70"
              >
                <span className={cn('flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-2xl backdrop-blur-sm', cheers.data?.mine ? 'opacity-70' : '')}>🍻</span>
                <span className="text-xs font-bold">{cheers.data?.count ?? 0}</span>
              </button>

              {/* Zap */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    disabled={zap.isPending}
                    title="Zap sats ⚡"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500 text-amber-950 transition hover:scale-110 active:scale-90 disabled:opacity-50"
                  >
                    <Zap size={22} strokeWidth={2.5} />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className='mb-2 text-center text-xs font-medium text-amber-900/80'>Zap sats ⚡</p>
                  <div className='grid grid-cols-3 gap-1.5'>
                    {[21, 100, 500, 1000, 2100, 5000].map((amount) => (
                      <button
                        key={amount}
                        type='button'
                        disabled={zap.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          zap.mutate({ pubkey: checkIn.pubkey, eventId: checkIn.id, amount });
                        }}
                        className='rounded-full bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-400 disabled:opacity-50'
                      >
                        {amount.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Share */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); share(); }}
                aria-label="Share this page"
                title="Share"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:scale-110 active:scale-90"
              >
                <Share2 size={22} />
              </button>

              {/* Log out */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm('Log out of Beerbook?')) {
                    removeLogin(logins[0].id);
                    setMenuOpen(false);
                  }
                }}
                aria-label="Log out"
                title="Log out"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:scale-110 hover:bg-red-800/80 active:scale-90"
              >
                <LogOut size={22} />
              </button>

              {/* Delete (own pages only) */}
              {isMine && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Remove this page from your Beerbook?')) del.mutate({ id: checkIn.id });
                  }}
                  disabled={del.isPending}
                  aria-label="Delete this page"
                  title="Delete"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:scale-110 hover:bg-red-800/80 active:scale-90 disabled:opacity-50"
                >
                  <Trash2 size={22} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function TaggedAvatar({ pubkey }: { pubkey: string }) {
  const { data: author } = useAuthor(pubkey);
  const picture = author?.metadata?.picture;
  return picture ? (
    <img
      src={picture}
      alt=""
      title={author?.metadata?.display_name || pubkey.slice(0, 8)}
      className="h-5 w-5 rounded-full border border-amber-400/50 object-cover"
    />
  ) : (
    <div className="h-5 w-5 rounded-full border border-amber-400/50 bg-amber-800" title={pubkey.slice(0, 8)} />
  );
}
