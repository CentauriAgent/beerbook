import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NostrContext } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { TestApp } from '@/test/TestApp';

/** Check-in under test (root of the comment thread). */
const CHECK_ID = 'a'.padEnd(64, '1');
const CHECK_PUBKEY = 'b'.padEnd(64, '2');
const checkIn = { id: CHECK_ID, pubkey: CHECK_PUBKEY };

// -- Mock the Nostr layer (no relays touched) ------------------------------

vi.mock('@/components/NostrProvider', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/components/NostrProvider')>();
  return { ...orig, default: orig.default };
});

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    user: {
      pubkey: 'me'.padEnd(64, '5'),
      signer: {
        signEvent: async (t: { kind: number; content: string; tags: string[][]; created_at: number }) =>
          ({ ...t, id: 'ev'.padEnd(64, '6'), pubkey: 'me'.padEnd(64, '5'), sig: 'sig' }) as unknown as NostrEvent,
      },
    },
  }),
}));

const published: unknown[] = [];

const stubComment = (id: string, content: string, created_at: number): NostrEvent => ({
  id,
  pubkey: 'bob'.padEnd(64, '7'),
  kind: 1111,
  content,
  tags: [
    ['E', CHECK_ID],
    ['e', CHECK_ID],
    ['p', CHECK_PUBKEY],
  ],
  created_at,
  sig: 's',
});

vi.mock('@nostrify/react', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@nostrify/react')>();
  return {
    ...orig,
    useNostr: () => ({
      nostr: {
        query: async () => [
          stubComment('c'.padEnd(64, '8'), 'Z tastes like honey', 1_000),
          stubComment('d'.padEnd(64, '9'), 'crisp!', 2_000),
        ],
        event: vi.fn(async (ev: unknown) => { published.push(ev); return ev; }),
      },
    }),
  };
});

// ---------------------------------------------------------------------------

import { Comments } from './Comments';

describe('Comments UI → NIP-22 publish', () => {
  it('shows a comment button with count, opens the sheet, and publishes a correct kind 1111', async () => {
    render(
      <TestApp>
        <NostrContext.Provider value={{ nostr: { query: async () => [], event: async () => {} } } as never}>
          <Comments checkIn={checkIn} />
        </NostrContext.Provider>
      </TestApp>,
    );

    // Comment affordance renders with fetched count.
    const btn = await screen.findByRole('button', { name: /Comments \(2\)/ });
    fireEvent.click(btn);

    // Sheet opens with existing comments + focused composer.
    expect(await screen.findByText('crisp!')).toBeTruthy();
    const input = await screen.findByLabelText('Write a comment');
    expect(document.activeElement).toBe(input);

    // Type + send → kind 1111 published with NIP-22 tag structure.
    fireEvent.change(input, { target: { value: 'Delicious pour!' } });
    fireEvent.click(screen.getByLabelText('Send comment'));

    await waitFor(() => expect(published).toHaveLength(1));
    const ev = published[0] as { kind: number; content: string; tags: string[][] };
    expect(ev.kind).toBe(1111);
    expect(ev.content).toBe('Delicious pour!');
    expect(ev.tags).toContainEqual(['E', CHECK_ID, expect.any(String), CHECK_PUBKEY]);
    expect(ev.tags).toContainEqual(['K', '1']);
    expect(ev.tags).toContainEqual(['P', CHECK_PUBKEY, expect.any(String)]);
    expect(ev.tags).toContainEqual(['e', CHECK_ID, expect.any(String), CHECK_PUBKEY]);
    expect(ev.tags).toContainEqual(['k', '1']);
    expect(ev.tags).toContainEqual(['p', CHECK_PUBKEY, expect.any(String)]);
  });
});
