import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Camera, Plus, Search, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { LoginArea } from '@/components/auth/LoginArea';
import { StarRating } from '@/components/StarRating';
import { BeerPage } from '@/components/BeerPage';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { useBeerSearch } from '@/hooks/useBeerSearch';
import { useUserSearch } from '@/hooks/useUserSearch';
import { useAuthor } from '@/hooks/useAuthor';
import { FLAVORS, SERVINGS, buildCheckInEvent, type BeerCheckIn } from '@/lib/beerbook';
import { buildBeerEvent, type BeerRecord } from '@/lib/beers';
import { StylePicker, type StylePickerValue } from '@/components/StylePicker';
import { cn } from '@/lib/utils';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

interface SelectedBeer {
  record?: BeerRecord; // chosen from Nostr or catalog (catalog needs publishing)
  name: string;
  brewery: string;
  beerRef?: string;
}

export function Composer() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const publish = useNostrPublish();
  const upload = useUploadFile();

  const [beer, setBeer] = useState<SelectedBeer>({ name: '', brewery: '' });
  const [beerQuery, setBeerQuery] = useState('');
  const [showBeerForm, setShowBeerForm] = useState(false);
  const [newBeer, setNewBeer] = useState({ name: '', brewery: '', abv: '', ibu: '' });
  const [newStyle, setNewStyle] = useState<StylePickerValue | null>(null);
  const [rating, setRating] = useState(0);
  const [description, setDescription] = useState('');
  const [flavors, setFlavors] = useState<string[]>([]);
  const [serving, setServing] = useState<string>('');
  const [location, setLocation] = useState('');
  const [tagged, setTagged] = useState<string[]>([]);
  const [buddyQuery, setBuddyQuery] = useState('');
  const [imetaTag, setImetaTag] = useState<string[] | null>(null); // full imeta tag array
  const [photoError, setPhotoError] = useState<string | null>(null);

  const debouncedBeerQuery = useDebounced(beerQuery, 350);
  const beerSearch = useBeerSearch(debouncedBeerQuery);
  const debouncedBuddyQuery = useDebounced(buddyQuery, 350);
  const buddySearch = useUserSearch(debouncedBuddyQuery);

  const previewImage = imetaTag?.find((v) => v.startsWith('url '))?.slice(4) || undefined;

  const preview: BeerCheckIn = useMemo(
    () => ({
      id: 'preview',
      pubkey: user?.pubkey ?? '',
      beer: beer.name || 'Beer Name',
      brewery: beer.brewery || 'Brewery',
      rating,
      description,
      flavors,
      serving: serving || undefined,
      location: location || undefined,
      image: previewImage,
      taggedUsers: tagged,
      beerRef: beer.beerRef,
      createdAt: Math.floor(new Date().getTime() / 1000),
    }),
    [user, beer, rating, description, flavors, serving, location, previewImage, tagged],
  );

  const toggleFlavor = (f: string) =>
    setFlavors((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  const selectBeer = (record: BeerRecord) => {
    setBeer({
      record,
      name: record.name,
      brewery: record.brewery,
      // Nostr records already have a d slug; catalog results get one on publish
      beerRef: record.pubkey ? record.d : undefined,
    });
    setBeerQuery('');
    setShowBeerForm(false);
    toast({
      title: record.source === 'catalog.beer' ? 'Added from catalog.beer' : 'Found on Nostr 🍺',
      description: `${record.name}${record.style ? ` (${record.style})` : ''}`,
    });
  };

  const submitNewBeer = async () => {
    if (!user) {
      toast({ title: 'Log in first', description: 'Adding a beer publishes it from your key.', variant: 'destructive' });
      return;
    }
    if (!newBeer.name.trim() || !newBeer.brewery.trim()) return;
    // ABV: decimal 0–20; IBU: integer 0–120 (optional)
    const abvNum = newBeer.abv.trim() === '' ? undefined : Number(newBeer.abv);
    if (abvNum != null && (!Number.isFinite(abvNum) || abvNum < 0 || abvNum > 20)) {
      toast({ title: 'ABV must be a number between 0 and 20', variant: 'destructive' });
      return;
    }
    const ibuNum = newBeer.ibu.trim() === '' ? undefined : Number(newBeer.ibu);
    if (ibuNum != null && (!Number.isInteger(ibuNum) || ibuNum < 0 || ibuNum > 120)) {
      toast({ title: 'IBU must be a whole number between 0 and 120', variant: 'destructive' });
      return;
    }
    const brewery = normalizeBrewery(newBeer.brewery);
    const template = buildBeerEvent({
      name: newBeer.name.trim(),
      brewery,
      style: newStyle?.name,
      style_id: newStyle?.id,
      abv: abvNum != null ? abvNum.toFixed(1) : undefined,
      ibu: ibuNum != null ? String(ibuNum) : undefined,
    });
    try {
      const event = await publish.mutateAsync(template);
      setBeer({
        name: newBeer.name.trim(),
        brewery,
        beerRef: template.tags.find(([n]) => n === 'd')?.[1],
        record: {
          d: template.tags.find(([n]) => n === 'd')![1],
          name: newBeer.name.trim(),
          brewery: newBeer.brewery.trim(),
          eventId: event.id,
          pubkey: event.pubkey,
          createdAt: event.created_at,
        },
      });
      setShowBeerForm(false);
      setNewStyle(null);
      setBeerQuery('');
      toast({ title: 'Beer added to the Nostr inventory 📖', description: newBeer.name.trim() });
    } catch (error) {
      toast({
        title: 'Failed to publish beer record',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const addBuddy = (pubkey: string) => {
    setTagged((cur) => (cur.includes(pubkey) ? cur : [...cur, pubkey]));
    setBuddyQuery('');
  };

  const addBuddyRaw = (v: string) => {
    let pubkey = v.trim();
    if (!pubkey) return;
    if (pubkey.startsWith('npub1')) {
      try {
        pubkey = nip19.decode(pubkey).data as string;
      } catch {
        toast({ title: 'Invalid npub', variant: 'destructive' });
        return;
      }
    }
    if (!/^[0-9a-f]{64}$/.test(pubkey)) {
      toast({ title: 'Invalid pubkey', variant: 'destructive' });
      return;
    }
    addBuddy(pubkey);
  };

  const onPhoto = async (file: File) => {
    setPhotoError(null);
    try {
      const tags = await upload.mutateAsync(file);
      const url = tags.find(([name]) => name === 'url')?.[1];
      if (!url) throw new Error('No image URL returned by the upload server');
      setImetaTag(['imeta', ...tags.map((t) => t.join(' '))]);
    } catch (error) {
      setImetaTag(null);
      setPhotoError(error instanceof Error ? error.message : 'Upload failed');
      toast({
        title: 'Photo upload failed',
        description: 'The page could not be saved with this photo. Try again — publishing is blocked until the photo uploads.',
        variant: 'destructive',
      });
    }
  };

  // Photo is the page art — publishing is blocked until it uploads successfully.
  const canPublish = user && beer.name.trim() && rating > 0 && !!previewImage;

  const onPublish = async () => {
    if (!canPublish) return;
    let beerRef = beer.beerRef;
    let beerAuthor = beer.record?.pubkey;
    const beerName = beer.name.trim();
    const brewery = beer.brewery.trim();

    // If the chosen beer came from catalog.beer and isn't on Nostr yet,
    // publish it as kind 31006 from the user's key (self-populating inventory).
    if (beer.record?.eventId.startsWith('catalog:') && !beerRef) {
      const template = buildBeerEvent({
        name: beerName,
        brewery,
        style: beer.record.style,
        abv: beer.record.abv,
        ibu: beer.record.ibu,
        description: beer.record.description,
        image: beer.record.image,
        source: 'catalog.beer',
      });
      try {
        const event = await publish.mutateAsync(template);
        beerRef = template.tags.find(([n]) => n === 'd')?.[1];
        beerAuthor = event.pubkey;
      } catch {
        toast({ title: "Couldn't publish the beer record", description: 'Publishing check-in anyway', variant: 'destructive' });
      }
    }

    const template = buildCheckInEvent({
      beer: beerName,
      brewery,
      rating,
      description,
      flavors,
      serving: serving || undefined,
      location: location || undefined,
      imageTags: imetaTag ? [imetaTag] : [],
      taggedUsers: tagged,
      beerRef,
      beerAuthor: beer.record?.pubkey,
    });
    try {
      await publish.mutateAsync({ kind: 1, content: template.content, tags: template.tags });
      toast({ title: '📖 Page published!', description: `Cheers to ${beerName}!` });
      navigate('/');
    } catch (error) {
      toast({
        title: 'Publish failed',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-dvh bg-amber-50 pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-amber-200 bg-amber-100/90 px-4 py-3 backdrop-blur">
        <Button variant="ghost" onClick={() => navigate(-1)} className="text-amber-900">
          <X size={20} />
        </Button>
        <h1 className="font-serif text-lg font-bold text-amber-950">New Page</h1>
        <LoginArea />
      </header>

      <div className="mx-auto max-w-lg space-y-6 p-4">
        {!user && (
          <div className="rounded-xl border border-amber-300 bg-amber-100 p-4 text-center text-sm text-amber-900">
            Log in with your Nostr account (NIP-07) to write in your Beerbook. <LoginArea className="ml-2" />
          </div>
        )}

        {/* Live page preview */}
        <div>
          <Label className="mb-2 block font-serif text-amber-900">Page preview</Label>
          <div className="aspect-[3/4] overflow-hidden rounded-lg border-2 border-amber-300 shadow-xl sm:aspect-[4/5]">
            <BeerPage checkIn={preview} interactive={false} />
          </div>
        </div>

        {/* Photo */}
        <div>
          <Label className="mb-2 block font-serif text-amber-900">Beer photo *</Label>
          <label className="flex aspect-video w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-100/50 text-amber-800 hover:bg-amber-100">
            {upload.isPending ? 'Uploading… ⏳' : previewImage ? '✅ Photo uploaded — tap to change' : (
              <>
                <Camera size={20} /> Add a photo
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={upload.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPhoto(f);
                e.target.value = '';
              }}
            />
          </label>
          {photoError && (
            <p className="mt-1 text-sm font-medium text-red-700">⚠️ Upload failed: {photoError} — pick the photo again. You can’t publish until it uploads.</p>
          )}
        </div>

        {/* Beer search + selection */}
        <div>
          <Label className="mb-2 block font-serif text-amber-900">Beer *</Label>

          {beer.name ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-400 bg-amber-100 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-amber-950">{beer.name}</p>
                <p className="truncate text-sm text-amber-800">
                  {beer.brewery || '—'}
                  {beer.record?.style ? ` · ${beer.record.style}` : ''}
                  {beer.beerRef ? ' · 🍺 in inventory' : ''}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setBeer({ name: '', brewery: '' })} className="shrink-0 text-amber-900">
                <X size={16} /> Change
              </Button>
            </div>
          ) : showBeerForm ? (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-white p-3">
              <p className="font-serif text-sm text-amber-900">Add a new beer to the inventory</p>
              <Input placeholder="Beer name *" value={newBeer.name} onChange={(e) => setNewBeer({ ...newBeer, name: e.target.value })} className="border-amber-300" />
              <div>
                <Input
                  placeholder="Brewery *"
                  value={newBeer.brewery}
                  onChange={(e) => setNewBeer({ ...newBeer, brewery: e.target.value })}
                  onBlur={(e) => setNewBeer({ ...newBeer, brewery: normalizeBrewery(e.target.value) })}
                  className={cn('border-amber-300', breweryWarning(newBeer.brewery) && 'border-amber-500')}
                />
                {(() => {
                  const w = breweryWarning(newBeer.brewery);
                  return w ? <p className="mt-1 text-xs text-amber-700">Did you mean “{w}”?</p> : null;
                })()}
              </div>
              <div>
                <StylePicker value={newStyle} onChange={setNewStyle} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number" min={0} max={20} step={0.1} inputMode="decimal"
                  placeholder="ABV %" value={newBeer.abv}
                  onChange={(e) => setNewBeer({ ...newBeer, abv: e.target.value })}
                  className="border-amber-300"
                />
                <Input
                  type="number" min={0} max={120} step={1} inputMode="numeric"
                  placeholder="IBU (optional)" value={newBeer.ibu}
                  onChange={(e) => setNewBeer({ ...newBeer, ibu: e.target.value })}
                  className="border-amber-300"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={submitNewBeer} disabled={!newBeer.name.trim() || !newBeer.brewery.trim() || publish.isPending} className="bg-amber-600 text-amber-50 hover:bg-amber-700">
                  {publish.isPending ? 'Publishing…' : 'Add to inventory'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowBeerForm(false)} className="border-amber-400 text-amber-900">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-700/60" />
                <Input
                  value={beerQuery}
                  onChange={(e) => setBeerQuery(e.target.value)}
                  placeholder="Search beers (Nostr inventory + catalog.beer)…"
                  className="border-amber-300 bg-white pl-9"
                />
              </div>

              {beerQuery.trim().length >= 2 && (
                <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-amber-300 bg-white">
                  {beerSearch.isLoading && <p className="p-3 text-sm text-amber-800">Searching the taps…</p>}
                  {!beerSearch.isLoading && beerSearch.data && beerSearch.data.beers.length === 0 && (
                    <p className="p-3 text-sm text-amber-800">No beers found. Add it below 👇</p>
                  )}
                  {beerSearch.data?.beers.map((b) => (
                    <button
                      key={b.eventId}
                      type="button"
                      onClick={() => selectBeer(b)}
                      className="flex w-full items-center justify-between gap-2 border-b border-amber-100 px-3 py-2 text-left last:border-0 hover:bg-amber-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-amber-950">{b.name}</span>
                        <span className="block truncate text-xs text-amber-800">
                          {b.brewery || 'Unknown brewery'}{b.style ? ` · ${b.style}` : ''}{b.abv ? ` · ${b.abv}%` : ''}
                        </span>
                      </span>
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        b.pubkey ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800')}>
                        {b.pubkey ? 'Nostr' : 'catalog.beer'}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setShowBeerForm(true); setNewBeer({ name: beerQuery.trim(), brewery: '', abv: '', ibu: '' }); setNewStyle(null); }}
                    className="flex w-full items-center gap-2 bg-amber-100 px-3 py-2.5 text-left font-medium text-amber-900 hover:bg-amber-200"
                  >
                    <Plus size={16} /> Add “{beerQuery.trim()}” as a new beer
                  </button>
                </div>
              )}
              {beerQuery.trim().length < 2 && (
                <button type="button" onClick={() => setShowBeerForm(true)} className="mt-2 flex items-center gap-1 text-sm text-amber-800 underline-offset-2 hover:underline">
                  <Plus size={14} /> Can’t find it? Add a new beer
                </button>
              )}
            </>
          )}
        </div>

        {/* Rating */}
        <div>
          <Label className="mb-2 block font-serif text-amber-900">Rating *</Label>
          <StarRating value={rating} onChange={setRating} size={32} />
        </div>

        {/* Flavors */}
        <div>
          <Label className="mb-2 block font-serif text-amber-900">Flavor profile</Label>
          <div className="flex flex-wrap gap-2">
            {FLAVORS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => toggleFlavor(f)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition',
                  flavors.includes(f)
                    ? 'border-amber-600 bg-amber-500 font-semibold text-amber-950'
                    : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100',
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Serving */}
        <div>
          <Label className="mb-2 block font-serif text-amber-900">Serving style</Label>
          <div className="flex flex-wrap gap-2">
            {SERVINGS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setServing(serving === s ? '' : s)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm capitalize transition',
                  serving === s
                    ? 'border-amber-600 bg-amber-500 font-semibold text-amber-950'
                    : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <Label htmlFor="desc" className="mb-1 block font-serif text-amber-900">Tasting notes</Label>
          <Textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Piney, resinous, with a crisp bitter finish…"
            className="min-h-24 border-amber-300 bg-white font-serif"
          />
        </div>

        {/* Location */}
        <div>
          <Label htmlFor="loc" className="mb-1 block font-serif text-amber-900">Location (optional)</Label>
          <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="The Nest Pub, Austin" className="border-amber-300 bg-white" />
        </div>

        {/* Buddy search */}
        <div>
          <Label className="mb-1 block font-serif text-amber-900">Drinking buddies</Label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-700/60" />
            <Input
              value={buddyQuery}
              onChange={(e) => setBuddyQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (buddySearch.data && buddySearch.data.length > 0) addBuddy(buddySearch.data[0].pubkey);
                  else addBuddyRaw(buddyQuery);
                }
              }}
              placeholder="Search by name, nip05, or paste an npub…"
              className="border-amber-300 bg-white pl-9"
            />
          </div>
          {buddyQuery.trim().length >= 2 && !buddyQuery.startsWith('npub') && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-amber-300 bg-white">
              {buddySearch.isLoading && <p className="p-3 text-sm text-amber-800">Finding buddies…</p>}
              {!buddySearch.isLoading && buddySearch.data?.length === 0 && (
                <p className="p-3 text-sm text-amber-800">Nobody found — try a nip05 like name@domain.com</p>
              )}
              {buddySearch.data?.map((u) => (
                <button
                  key={u.pubkey}
                  type="button"
                  onClick={() => addBuddy(u.pubkey)}
                  className="flex w-full items-center gap-3 border-b border-amber-100 px-3 py-2 text-left last:border-0 hover:bg-amber-50"
                >
                  {u.metadata?.picture ? (
                    <img src={u.metadata.picture} alt="" className="h-8 w-8 shrink-0 rounded-full border border-amber-300 object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs">🍺</div>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-amber-950">
                      {u.metadata?.display_name || u.metadata?.name || `${u.pubkey.slice(0, 8)}…`}
                    </span>
                    {u.metadata?.nip05 && <span className="block truncate text-xs text-amber-700">{u.metadata.nip05}</span>}
                  </span>
                  {u.isFollow && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Following</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {tagged.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tagged.map((p) => (
                <BuddyChip key={p} pubkey={p} onRemove={() => setTagged((cur) => cur.filter((x) => x !== p))} />
              ))}
            </div>
          )}
          <p className="mt-1 flex items-center gap-1 text-xs text-amber-700/80">
            <UserPlus size={12} /> Press Enter to add the top result, or paste an npub.
          </p>
        </div>

        <Button
          onClick={onPublish}
          disabled={!canPublish || publish.isPending}
          className="w-full bg-amber-600 py-6 text-lg font-bold text-amber-50 hover:bg-amber-700"
        >
          {publish.isPending ? 'Publishing…' : '📖 Write This Page'}
        </Button>
      </div>
    </div>
  );
}

function BuddyChip({ pubkey, onRemove }: { pubkey: string; onRemove: () => void }) {
  const author = useAuthorChip(pubkey);
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-amber-200 py-0.5 pl-0.5 pr-2 text-xs text-amber-900">
      {author?.picture ? (
        <img src={author.picture} alt="" className="h-6 w-6 rounded-full border border-amber-400 object-cover" />
      ) : (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-[10px]">🍺</div>
      )}
      {author?.name || `${pubkey.slice(0, 10)}…`}
      <button type="button" onClick={onRemove} aria-label="Remove buddy">
        <X size={12} />
      </button>
    </span>
  );
}

function useAuthorChip(pubkey: string) {
  const { data: author } = useAuthor(pubkey);
  const m = author?.metadata;
  return m ? { name: m.display_name || m.name, picture: m.picture } : undefined;
}
