import { useMemo, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { searchStyles, srmRangeLabel, styleById } from '@/lib/beerStyles';

export interface StylePickerValue {
  /** Display name, e.g. "American-Style India Pale Ale" */
  name: string;
  /** catalog.beer slug, e.g. "american-ipa" */
  id: string;
}

export function StylePicker({
  value,
  onChange,
}: {
  value: StylePickerValue | null;
  onChange: (v: StylePickerValue | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchStyles(query, 60), [query]);
  const srm = value ? srmRangeLabel(styleById(value.id)) : null;

  return (
    <div className="relative">
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-400 bg-amber-100 px-3 py-2">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-amber-950">{value.name}</span>
            <span className="block text-xs text-amber-700">
              {value.id}
              {srm ? ` · Style SRM range: ${srm}` : ''}
            </span>
          </span>
          <button type="button" onClick={() => onChange(null)} aria-label="Clear style" className="shrink-0 text-amber-800 hover:text-amber-950">
            <X size={16} />
          </button>
        </div>
      ) : (
        <>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-700/60" />
          <Input
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search styles (IPA, Hefeweizen, Stout…)"
            className="border-amber-300 bg-white pl-9"
          />
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-amber-700/60" />
        </>
      )}

      {open && !value && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-amber-300 bg-white shadow-lg">
          {results.length === 0 && (
            <p className="p-3 text-sm text-amber-800">No styles match “{query}”. Try a broader term like “ale” or “lager”.</p>
          )}
          {results.map(({ style, group }) => (
            <button
              key={style.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange({ name: style.name, id: style.id }); setQuery(''); setOpen(false); }}
              className="block w-full border-b border-amber-100 px-3 py-2 text-left last:border-0 hover:bg-amber-50"
            >
              <span className="block text-sm font-medium text-amber-950">
                {group} {style.catch_all && <span className="font-normal text-amber-600">(generic)</span>}
              </span>
              {style.aliases.length > 0 && (
                <span className="block truncate text-xs text-amber-700">aka {style.aliases.slice(0, 4).join(', ')}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
