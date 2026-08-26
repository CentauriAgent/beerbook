import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Maximize2, Minimize2, Share2, Zap } from 'lucide-react';
import { StarRating } from '@/components/StarRating';
import { useZap } from '@/hooks/useZap';
import { useAuthor } from '@/hooks/useAuthor';
import type { BeerCheckIn } from '@/lib/beerbook';
import { beerPath, profilePath, readerPath } from '@/lib/nip19links';
import { cn } from '@/lib/utils';

interface BeerPageProps {
  checkIn: BeerCheckIn;
  interactive?: boolean; // enable zap/maximize buttons
}

/** A single book "page": full-bleed photo + overlay. */
export function BeerPage({ checkIn, interactive = true }: BeerPageProps) {
  const [expanded, setExpanded] = useState(true);
  const zap = useZap();
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
        <div className="bg-gradient-to-t from-black/90 via-black/60 to-transparent px-5 pb-14 pt-24">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {beerLink ? (
                <Link
                  to={beerLink}
                  onClick={(e) => e.stopPropagation()}
                  className="truncate text-2xl font-bold leading-tight text-white drop-shadow-lg underline-offset-4 hover:underline"
                >
                  {checkIn.beer}
                </Link>
              ) : (
                <h2 className="truncate text-2xl font-bold leading-tight text-white drop-shadow-lg">
                  {checkIn.beer}
                </h2>
              )}
              {checkIn.brewery && (
                <p className="truncate font-serif text-base italic text-amber-200">{checkIn.brewery}</p>
              )}
            </div>
            <StarRating value={checkIn.rating} size={26} className="shrink-0" />
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

          {/* Author row + zap */}
          {interactive && (
            <div className="mt-3 flex items-center justify-between">
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
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    share();
                  }}
                  aria-label="Share this page"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-black/35 text-amber-100 transition hover:bg-black/55"
                >
                  <Share2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    zap.mutate({ pubkey: checkIn.pubkey, eventId: checkIn.id, amount: 21 });
                  }}
                  disabled={zap.isPending}
                  className="flex items-center gap-1 rounded-full bg-amber-500/90 px-3 py-1 text-xs font-semibold text-amber-950 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  <Zap size={14} /> {zap.isPending ? 'Zapping…' : 'Zap 21'}
                </button>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Maximize toggle */}
      {interactive && (
        <button
          type="button"
          aria-label={expanded ? 'Maximize photo' : 'Show details'}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="absolute right-3 top-3 rounded-full bg-black/40 p-2 text-white/90 backdrop-blur-sm transition hover:bg-black/60"
        >
          {expanded ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
        </button>
      )}
    </div>
  );
}

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
