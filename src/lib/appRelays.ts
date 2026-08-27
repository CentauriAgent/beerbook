import type { RelayMetadata } from '@/contexts/AppContext';

/**
 * App default relays. Used as the initial `relayMetadata` for new users and as
 * a fallback when the user has no NIP-65 relay list configured (e.g. during
 * nostrconnect handshakes before any user relays have been loaded).
 */
export const APP_RELAYS: RelayMetadata = {
  relays: [
    { url: 'wss://relay.ditto.pub/', read: true, write: true },
    // dreamith.to serves NO #beerbook events (returns empty EOSE fast). With it
    // in the read pool, NPool.query's eoseTimeout timer starts at its empty
    // EOSE and can abort before ditto.pub answers on cold connections —
    // silently resolving the query with ZERO events ("empty book" bug).
    // Write-only until it actually mirrors the tag.
    { url: 'wss://relay.dreamith.to/', read: false, write: true },
    { url: 'wss://relay.primal.net/', read: false, write: true },
    { url: 'wss://nos.lol/', read: false, write: true },
  ],
  updatedAt: 0,
};
