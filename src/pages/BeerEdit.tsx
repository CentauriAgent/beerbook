import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { LoginArea } from '@/components/auth/LoginArea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useBeerBySlug } from '@/hooks/useBeerSearch';
import { buildBeerEvent, BEER_KIND } from '@/lib/beers';
import { beerAddrEncode, decodeNip19 } from '@/lib/nip19links';

/**
 * Edit a kind 31006 beer record you published.
 * The `d` tag is the record's identity — it is preserved from the original
 * event and never editable here, even if name/brewery change.
 */
export default function BeerEdit() {
  const { ref = '' } = useParams<{ ref: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const publish = useNostrPublish();

  const decoded = decodeNip19(ref);
  const naddr = decoded?.type === 'naddr' ? decoded : undefined;
  const slug = naddr ? naddr.d : (/^[0-9a-f]{64}$/.test(ref) ? undefined : ref);
  const eventId = /^[0-9a-f]{64}$/.test(ref) ? ref : undefined;
  const { data: record, isLoading } = useBeerBySlug(slug ?? eventId, naddr?.pubkey);

  const [name, setName] = useState('');
  const [brewery, setBrewery] = useState('');
  const [style, setStyle] = useState('');
  const [abv, setAbv] = useState('');
  const [ibu, setIbu] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Pre-fill the form once the record arrives. Name/brewery are display-only
  // here — editing them does NOT change the d tag (identity is fixed).
  useEffect(() => {
    if (record && !loaded) {
      setName(record.name);
      setBrewery(record.brewery);
      setStyle(record.style ?? '');
      setAbv(record.abv ?? '');
      setIbu(record.ibu ?? '');
      setDescription(record.description ?? '');
      setImage(record.image ?? '');
      setLoaded(true);
    }
  }, [record, loaded]);

  const isOwner = !!record && !!user && record.pubkey === user.pubkey;

  const onSave = async () => {
    if (!record || !isOwner) return;
    if (!name.trim() || !brewery.trim()) {
      toast({ title: 'Name and brewery are required', variant: 'destructive' });
      return;
    }
    const abvNum = abv.trim() === '' ? undefined : Number(abv);
    if (abvNum != null && (!Number.isFinite(abvNum) || abvNum < 0 || abvNum > 20)) {
      toast({ title: 'ABV must be a number between 0 and 20', variant: 'destructive' });
      return;
    }
    const ibuNum = ibu.trim() === '' ? undefined : Number(ibu);
    if (ibuNum != null && (!Number.isInteger(ibuNum) || ibuNum < 0 || ibuNum > 120)) {
      toast({ title: 'IBU must be a whole number between 0 and 120', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // CRITICAL: pass the original d tag explicitly — buildBeerEvent would
      // otherwise derive a new slug from the (possibly edited) name/brewery,
      // creating a brand-new record instead of replacing this one.
      const template = buildBeerEvent({
        name: name.trim(),
        brewery: brewery.trim(),
        style: style.trim() || undefined,
        style_id: record.style_id, // preserved — not editable in the form
        abv: abvNum != null ? abvNum.toFixed(1) : undefined,
        ibu: ibuNum != null ? String(ibuNum) : undefined,
        description: description.trim() || undefined,
        image: image.trim() || undefined,
        source: record.source, // preserve provenance (e.g. catalog.beer)
        d: record.d,
      });
      await publish.mutateAsync(template);
      await queryClient.invalidateQueries({ queryKey: ['beer'] });
      toast({ title: 'Beer updated 🍺', description: name.trim() });
      navigate(`/beer/${beerAddrEncode(record.d, record.pubkey)}`);
    } catch (error) {
      toast({
        title: 'Failed to save beer record',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-amber-50 pb-10">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-amber-200 bg-amber-100/90 px-4 py-3 backdrop-blur">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1 text-amber-900">
          <ArrowLeft size={20} /> Back
        </button>
        <h1 className="font-serif text-lg font-bold text-amber-950">Edit beer</h1>
        <LoginArea />
      </header>

      <div className="mx-auto max-w-lg space-y-4 p-4">
        {isLoading ? (
          <p className="text-center font-serif text-amber-800">Opening the label…</p>
        ) : !record ? (
          <p className="text-center font-serif text-amber-800">Beer not found.</p>
        ) : !isOwner ? (
          <p className="text-center font-serif text-amber-800">
            You can only edit beer records published by your own key.
          </p>
        ) : (
          <>
            <p className="text-xs text-amber-700/70">
              Editing record <code className="rounded bg-amber-100 px-1">{record.d}</code> (kind {BEER_KIND}).
              The record ID never changes — name and brewery here are display-only.
            </p>
            <div className="space-y-1">
              <Label htmlFor="beer-name">Beer name</Label>
              <Input id="beer-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pliny the Elder" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="beer-brewery">Brewery</Label>
              <Input id="beer-brewery" value={brewery} onChange={(e) => setBrewery(e.target.value)} placeholder="e.g. Russian River" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="beer-style">Style</Label>
              <Input id="beer-style" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="e.g. American IPA" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="beer-abv">ABV (%)</Label>
                <Input id="beer-abv" inputMode="decimal" value={abv} onChange={(e) => setAbv(e.target.value)} placeholder="8.0" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="beer-ibu">IBU</Label>
                <Input id="beer-ibu" inputMode="numeric" value={ibu} onChange={(e) => setIbu(e.target.value)} placeholder="65" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="beer-image">Image URL</Label>
              <Input id="beer-image" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" />
              {image.trim() && (
                <img src={image} alt="Beer" className="mt-2 h-32 w-full rounded-xl border border-amber-200 object-cover" />
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="beer-description">Description</Label>
              <Textarea id="beer-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tasting notes, history…" />
            </div>
            <Button onClick={onSave} disabled={saving || !name.trim() || !brewery.trim()} className="w-full bg-amber-600 text-white hover:bg-amber-700">
              {saving ? 'Saving…' : 'Save beer'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
