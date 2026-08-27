import { useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Share2 } from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { PullToRefresh } from '@/components/PullToRefresh';
import { StarRating } from '@/components/StarRating';
import { useBeerBySlug } from '@/hooks/useBeerSearch';
import { useBeerbookFeed } from '@/hooks/useBeerbookFeed';
import { useAuthor } from '@/hooks/useAuthor';
import { beerAddrEncode, decodeNip19, readerPath, type DecodedNip19 } from '@/lib/nip19links';

/** Beer detail: the kind 31006 record + every check-in of this beer. */
export default function BeerDetail({ naddr: propNaddr }: { naddr?: Extract<DecodedNip19, { type: 'naddr' }> } = {}) {
  const { ref = '' } = useParams<{ ref: string }>();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  // ref is an naddr1… (NIP-19 address, preferred) — legacy d-slug or 31006 event id still accepted
  const decoded = decodeNip19(ref);
  const naddr = propNaddr ?? (decoded?.type === 'naddr' ? decoded : undefined);
  const slug = naddr ? naddr.d : (/^[0-9a-f]{64}$/.test(ref) ? undefined : ref);
  const eventId = /^[0-9a-f]{64}$/.test(ref) ? ref : undefined;
  const { data: record, isLoading: recordLoading } = useBeerBySlug(slug, naddr?.pubkey);
  const { data: checkIns, isLoading: feedLoading } = useBeerbookFeed();

  const queryClient = useQueryClient();
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['beerbook-feed'] }),
    [queryClient],
  );

  useSeoMeta({
    title: record ? `${record.name} 🍺 Beerbook` : 'Beer 🍺 Beerbook',
    description: record?.description ?? 'Beer detail on Beerbook',
  });

  // check-ins referencing this beer by slug OR event id
  const beerCheckIns = useMemo(() => {
    if (!checkIns) return [];
    return checkIns.filter((c) => {
      if (!c.beerRef) return false;
      if (c.beerRef === ref || c.beerRef === slug || c.beerRef === naddr?.d) return true;
      if (eventId && c.beerRef === eventId) return true;
      // match via the record's own event id
      if (record && (c.beerRef === record.d || c.beerRef === record.eventId)) return true;
      return false;
    });
  }, [checkIns, ref, slug, eventId, naddr?.d, record]);

  const avg = beerCheckIns.length
    ? beerCheckIns.reduce((s, c) => s + c.rating, 0) / beerCheckIns.length
    : 0;

  const share = async () => {
    const addr = record ? beerAddrEncode(record.d, record.pubkey) : ref;
    const url = `${window.location.origin}/beer/${addr}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${record?.name ?? 'Beer'} — Beerbook`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch { /* cancelled */ }
  };

  return (
    <PullToRefresh onRefresh={refresh}>
    <div className="min-h-dvh bg-amber-50 pb-10">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-amber-200 bg-amber-100/90 px-4 py-3 backdrop-blur">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1 text-amber-900">
          <ArrowLeft size={20} /> Back
        </button>
        <h1 className="font-serif text-lg font-bold text-amber-950">Beer</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={share}
            title="Share this beer"
            className="flex items-center gap-1 rounded-full border border-amber-300 px-2.5 py-1 text-xs text-amber-900 hover:bg-amber-100"
          >
            <Share2 size={14} /> {copied ? 'Copied!' : 'Share'}
          </button>
          <LoginArea />
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-5 p-4">
        {recordLoading ? (
          <p className="text-center font-serif text-amber-800">Opening the label…</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-amber-300 bg-white shadow">
            {record?.image && (
              <img src={record.image} alt={record.name} className="h-48 w-full object-cover" />
            )}
            <div className="p-4">
              <h2 className="font-serif text-2xl font-bold text-amber-950">{record?.name ?? 'Unknown beer'}</h2>
              {record?.brewery && <p className="italic text-amber-800">{record.brewery}</p>}
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-amber-900">
                {record?.style && <span className="rounded-full bg-amber-100 px-2.5 py-0.5">{record.style}</span>}
                {record?.abv && <span className="rounded-full bg-amber-100 px-2.5 py-0.5">{record.abv}% ABV</span>}
                {record?.ibu && <span className="rounded-full bg-amber-100 px-2.5 py-0.5">{record.ibu} IBU</span>}
                {beerCheckIns.length > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5">
                    <StarRating value={Math.round(avg)} size={14} /> {avg.toFixed(1)}
                  </span>
                )}
              </div>
              {record?.description && (
                <p className="mt-3 font-serif text-sm leading-relaxed text-amber-900">{record.description}</p>
              )}
              {record?.source === 'catalog.beer' && (
                <p className="mt-2 text-xs text-amber-700/70">Data from catalog.beer (CC BY 4.0)</p>
              )}
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-2 font-serif text-lg font-bold text-amber-950">
            Check-ins {beerCheckIns.length > 0 && `(${beerCheckIns.length})`}
          </h3>
          {feedLoading ? (
            <p className="text-sm text-amber-800">Loading check-ins…</p>
          ) : beerCheckIns.length === 0 ? (
            <p className="text-sm text-amber-800">No check-ins of this beer yet. Be the first — <Link to="/new" className="underline">write a page</Link>.</p>
          ) : (
            <div className="space-y-3">
              {beerCheckIns.map((c) => (
                <CheckInRow key={c.id} id={c.id} pubkey={c.pubkey} rating={c.rating} description={c.description} image={c.image} createdAt={c.createdAt} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </PullToRefresh>
  );
}

function CheckInRow({ id, pubkey, rating, description, image, createdAt }: {
  id: string;
  pubkey: string;
  rating: number;
  description: string;
  image?: string;
  createdAt: number;
}) {
  const { data: author } = useAuthor(pubkey);
  return (
    <Link to={readerPath(id)} className="flex gap-3 rounded-xl border border-amber-200 bg-white p-3 shadow-sm hover:bg-amber-50">
      {image ? (
        <img src={image} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-2xl">🍺</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-amber-950">
            {author?.metadata?.display_name || author?.metadata?.name || `${pubkey.slice(0, 8)}…`}
          </span>
          <StarRating value={rating} size={14} />
        </div>
        <p className="line-clamp-2 font-serif text-xs text-amber-900/80">{description}</p>
        <p className="mt-1 text-[10px] text-amber-700/60">{new Date(createdAt * 1000).toLocaleDateString()}</p>
      </div>
    </Link>
  );
}
