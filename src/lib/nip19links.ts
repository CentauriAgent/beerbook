import { nip19 } from 'nostr-tools';
import { BEER_KIND } from '@/lib/beers';

/** NIP-19 link helpers — Beerbook routes always use NIP-19 identifiers, never raw hex. */

export function npubEncode(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}

/** /u/npub1… profile route. */
export function profilePath(pubkey: string): string {
  return `/u/${npubEncode(pubkey)}`;
}

/** note1 reference for a kind 1 event id. */
export function noteEncode(eventId: string): string {
  try {
    return nip19.noteEncode(eventId);
  } catch {
    return eventId;
  }
}

/** Reader deep link /?page=note1… */
export function readerPath(eventId: string): string {
  return `/?page=${noteEncode(eventId)}`;
}

/** naddr1… for a kind 31006 beer record (kind + d tag + author pubkey). */
export function beerAddrEncode(d: string, authorPubkey: string, relays?: string[]): string {
  try {
    return nip19.naddrEncode({ kind: BEER_KIND, identifier: d, pubkey: authorPubkey, relays });
  } catch {
    return d;
  }
}

/** /beer/naddr1… route (falls back to a plain d slug if encoding fails). */
export function beerPath(d: string | undefined, authorPubkey?: string): string | undefined {
  if (!d) return undefined;
  if (authorPubkey && /^[0-9a-f]{64}$/.test(authorPubkey)) {
    return `/beer/${beerAddrEncode(d, authorPubkey)}`;
  }
  return `/beer/${d}`;
}

export type DecodedNip19 =
  | { type: 'npub' | 'nprofile'; pubkey: string; relays?: string[] }
  | { type: 'note' | 'nevent'; eventId: string; author?: string; kind?: number }
  | { type: 'naddr'; d: string; pubkey: string; kind: number; relays?: string[] };

/** Decode any NIP-19 bech32 identifier (npub/nprofile/note/nevent/naddr). */
export function decodeNip19(value: string): DecodedNip19 | null {
  try {
    const { type, data } = nip19.decode(value);
    switch (type) {
      case 'npub':
        return { type: 'npub', pubkey: data as string };
      case 'nprofile':
        return { type: 'nprofile', pubkey: (data as any).pubkey, relays: (data as any).relays };
      case 'note':
        return { type: 'note', eventId: data as string };
      case 'nevent':
        return {
          type: 'nevent',
          eventId: (data as any).id,
          author: (data as any).author,
          kind: (data as any).kind,
        };
      case 'naddr':
        return {
          type: 'naddr',
          d: (data as any).identifier,
          pubkey: (data as any).pubkey,
          kind: (data as any).kind,
          relays: (data as any).relays,
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}
