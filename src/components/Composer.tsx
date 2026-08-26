import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Camera, Plus, X } from 'lucide-react';
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
import { FLAVORS, SERVINGS, buildCheckInEvent, type BeerCheckIn } from '@/lib/beerbook';
import { cn } from '@/lib/utils';

export function Composer() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const publish = useNostrPublish();
  const upload = useUploadFile();

  const [beer, setBeer] = useState('');
  const [brewery, setBrewery] = useState('');
  const [rating, setRating] = useState(0);
  const [description, setDescription] = useState('');
  const [flavors, setFlavors] = useState<string[]>([]);
  const [serving, setServing] = useState<string>('');
  const [location, setLocation] = useState('');
  const [tagged, setTagged] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [imetaTag, setImetaTag] = useState<string[] | null>(null); // full imeta tag array

  const previewImage = imetaTag?.find((v) => v.startsWith('url '))?.slice(4) || undefined;

  const preview: BeerCheckIn = useMemo(
    () => ({
      id: 'preview',
      pubkey: user?.pubkey ?? '',
      beer: beer || 'Beer Name',
      brewery: brewery || 'Brewery',
      rating,
      description,
      flavors,
      serving: serving || undefined,
      location: location || undefined,
      image: previewImage,
      taggedUsers: tagged,
      createdAt: Math.floor(Date.now() / 1000),
    }),
    [user, beer, brewery, rating, description, flavors, serving, location, previewImage, tagged],
  );

  const toggleFlavor = (f: string) =>
    setFlavors((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  const addTag = () => {
    const v = tagInput.trim();
    if (!v) return;
    // accept npub or hex
    let pubkey = v;
    if (v.startsWith('npub1')) {
      try {
        pubkey = nip19.decode(v).data as string;
      } catch {
        toast({ title: 'Invalid npub', variant: 'destructive' });
        return;
      }
    }
    if (!/^[0-9a-f]{64}$/.test(pubkey)) {
      toast({ title: 'Invalid pubkey', variant: 'destructive' });
      return;
    }
    setTagged((cur) => (cur.includes(pubkey) ? cur : [...cur, pubkey]));
    setTagInput('');
  };

  const onPhoto = async (file: File) => {
    try {
      // Blossom/NIP-96 uploader returns imeta-style tag pairs: [['url', ...], ['x', ...], ...]
      const tags = await upload.mutateAsync(file);
      setImetaTag(['imeta', ...tags.map((t) => t.join(' '))]);
    } catch (error) {
      toast({
        title: 'Photo upload failed',
        description: error instanceof Error ? error.message : 'Try again',
        variant: 'destructive',
      });
    }
  };

  const canPublish = user && beer.trim() && rating > 0;

  const onPublish = async () => {
    if (!canPublish) return;
    const template = buildCheckInEvent({
      beer: beer.trim(),
      brewery: brewery.trim(),
      rating,
      description,
      flavors,
      serving: serving || undefined,
      location: location || undefined,
      imageTags: imetaTag ? [imetaTag] : [],
      taggedUsers: tagged,
    });
    try {
      await publish.mutateAsync({ kind: 1, content: template.content, tags: template.tags });
      toast({ title: '📖 Page published!', description: `Cheers to ${beer}!` });
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
            {upload.isPending ? 'Uploading…' : previewImage ? 'Change photo' : (
              <>
                <Camera size={20} /> Add a photo
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPhoto(f);
              }}
            />
          </label>
        </div>

        {/* Beer + brewery */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="beer" className="mb-1 block font-serif text-amber-900">Beer *</Label>
            <Input id="beer" value={beer} onChange={(e) => setBeer(e.target.value)} placeholder="Pale Ale" className="border-amber-300 bg-white" />
          </div>
          <div>
            <Label htmlFor="brewery" className="mb-1 block font-serif text-amber-900">Brewery</Label>
            <Input id="brewery" value={brewery} onChange={(e) => setBrewery(e.target.value)} placeholder="Stone Brewing" className="border-amber-300 bg-white" />
          </div>
        </div>

        {/* Rating */}
        <div>
          <Label className="mb-2 block font-serif text-amber-900">Rating *</Label>
          <StarRating value={rating} onChange={setRating} size={28} />
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

        {/* Tag users */}
        <div>
          <Label className="mb-1 block font-serif text-amber-900">Drinking buddies (npub)</Label>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              placeholder="npub1…"
              className="border-amber-300 bg-white"
            />
            <Button type="button" onClick={addTag} variant="outline" className="border-amber-400 text-amber-900">
              <Plus size={16} />
            </Button>
          </div>
          {tagged.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tagged.map((p) => (
                <span key={p} className="flex items-center gap-1 rounded-full bg-amber-200 px-2.5 py-0.5 text-xs text-amber-900">
                  {p.slice(0, 10)}…
                  <button type="button" onClick={() => setTagged((cur) => cur.filter((x) => x !== p))}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
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
