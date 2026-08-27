/* eslint-disable react-refresh/only-export-components -- harness entry */
import '@/index.css';
/* Profile e2e harness: mounts the REAL Profile page with a stubbed nostr pool
 * (no network) serving synthetic kind 0 metadata + kind 1 #beerbook check-ins.
 * `?empty=1` renders a profile with zero check-ins (empty state). */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NostrContext } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { createHead, UnheadProvider } from '@unhead/react/client';
import { NostrLoginProvider } from '@nostrify/react/login';
import { Profile } from '@/pages/Profile';

const PUBKEY = 'a'.repeat(64);

const hex = (n: number) => n.toString(16).padStart(64, '0');

function checkIn(n: number, over: { rating: number; brewery: string; flavors: string[] }): NostrEvent {
  return {
    id: hex(n),
    pubkey: PUBKEY,
    kind: 1,
    created_at: 1756000000 + n * 600,
    sig: 'b'.repeat(128),
    tags: [
      ['t', 'beerbook'],
      ['client', 'beerbook'],
      ['rating', String(over.rating)],
      ['brewery', over.brewery],
      ['beer_name', `Harness Beer ${n}`],
      ...over.flavors.map((f) => ['flavor', f.toLowerCase()]),
    ],
    content: `🍺 Drinking Harness Beer ${n} by ${over.brewery} — ${over.rating}★\n#beerbook`,
  } as NostrEvent;
}

const METADATA: NostrEvent = {
  id: hex(999),
  pubkey: PUBKEY,
  kind: 0,
  created_at: 1756000000,
  sig: 'b'.repeat(128),
  tags: [],
  content: JSON.stringify({
    name: 'harness',
    display_name: 'Hops McBookshelf',
    nip05: 'hops@beerbook.example',
    picture: 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#d97706"/><text x="64" y="80" font-size="64" text-anchor="middle">🍺</text></svg>',
    ),
  }),
} as NostrEvent;

const CHECKINS: NostrEvent[] = [
  checkIn(1, { rating: 4, brewery: 'Founders', flavors: ['Hoppy', 'Citrusy'] }),
  checkIn(2, { rating: 5, brewery: 'Founders', flavors: ['hoppy'] }),
  checkIn(3, { rating: 3, brewery: 'Tree House', flavors: ['Hazy', 'Juicy'] }),
  checkIn(4, { rating: 5, brewery: 'Bell\u2019s', flavors: ['Roasty', 'Chocolatey'] }),
  checkIn(5, { rating: 2, brewery: 'Tree House', flavors: ['Hoppy', 'Juicy'] }),
];

const EMPTY = new URLSearchParams(location.search).has('empty');

const stubNostr = {
  query: async (filters: { kinds: number[] }[]) => {
    const kinds = filters.flatMap((f) => f.kinds);
    if (EMPTY) return kinds.includes(0) ? [METADATA] : [];
    if (kinds.includes(0)) return [METADATA];
    if (kinds.includes(5)) return [];
    return [...CHECKINS].sort((a, b) => b.created_at - a.created_at);
  },
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Harness() {
  const head = createHead();
  return (
    <NostrContext.Provider value={{ nostr: stubNostr as never }}>
      <UnheadProvider head={head}>
        <NostrLoginProvider storageKey="harness-logins">
        <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/npub-test`]}>
          <Profile pubkey={PUBKEY} />
        </MemoryRouter>
        </QueryClientProvider>
        </NostrLoginProvider>
      </UnheadProvider>
    </NostrContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);

// Signal for e2e: metadata + feed queries settled.
setTimeout(() => { (window as unknown as { __ready: boolean }).__ready = true; }, 800);
