---
name: onchain-bitcoin
description: Add an onchain Bitcoin wallet derived from the user's Nostr identity. Every Nostr keypair maps deterministically to a Taproot (P2TR) address via shared secp256k1 + BIP-340 cryptography, so the same nsec receives, signs PSBTs, and broadcasts transactions through mempool.space — with no LNURL, custodian, or HD derivation. Includes balance/tx queries, send pipeline (build → sign → broadcast), capability detection across nsec / NIP-07 / NIP-46 signers, and kind 8333 onchain zaps with on-chain verification.
---

# Onchain Bitcoin Wallet

Nostr public keys (`npub` / 32-byte hex) are byte-for-byte identical to Bitcoin Taproot internal keys (BIP-340 / BIP-341): both are 32-byte x-only secp256k1 keys. This means **every Nostr identity already owns a Bitcoin address** — no key conversion, no HD derivation, no LNURL provider needed.

This skill ships a complete in-app wallet:

- Derive the user's `bc1p…` Taproot address from their pubkey
- Display balance, USD value, and transaction history
- Send Bitcoin via a PSBT pipeline that works with **all three** Nostrify signer types
- Publish and verify NIP-73 / kind 8333 "onchain zaps"
- Render NIP-73 `bitcoin:tx:` and `bitcoin:address:` identifiers in the existing `/:nip19` router

## Why It Works

| Property | Nostr | Bitcoin Taproot |
|---|---|---|
| Curve | secp256k1 | secp256k1 |
| Signature scheme | Schnorr (BIP-340) | Schnorr (BIP-340) |
| Public key format | 32-byte x-only | 32-byte x-only |

Because the formats match, a Nostr pubkey **is** a Taproot internal key (`P`). The on-chain output key is the standard BIP-341 tweak `Q = P + taggedHash("TapTweak", P) · G` with no script tree (key-path-only spend), encoded as bech32m with HRP `bc` and witness version 1 — always producing a `bc1p…` address.

`bitcoinjs-lib`'s `payments.p2tr({ internalPubkey })` performs the tweak + bech32m encoding internally.

## Files Provided by This Skill

| Skill file | Copy to |
|---|---|
| `files/lib/bitcoin.ts` | `src/lib/bitcoin.ts` |
| `files/lib/bitcoin-signers.ts` | `src/lib/bitcoin-signers.ts` |
| `files/hooks/useBitcoinWallet.ts` | `src/hooks/useBitcoinWallet.ts` |
| `files/hooks/useBitcoinAddress.ts` | `src/hooks/useBitcoinAddress.ts` |
| `files/hooks/useBitcoinTx.ts` | `src/hooks/useBitcoinTx.ts` |
| `files/hooks/useBitcoinSigner.ts` | `src/hooks/useBitcoinSigner.ts` |
| `files/hooks/useOnchainZap.ts` | `src/hooks/useOnchainZap.ts` |
| `files/hooks/useOnchainZaps.ts` | `src/hooks/useOnchainZaps.ts` |

These files are framework-only. The wallet page, send dialog, and on-chain zap UI are built on top of them.

## Setup Instructions

### 1. Install Dependencies

```bash
npm install bitcoinjs-lib @bitcoinerlab/secp256k1 ecpair tiny-secp256k1
```

`buffer` is already a dependency of the template; if you removed it, also `npm install buffer`.

| Package | Role |
|---|---|
| `bitcoinjs-lib` | P2TR address derivation, PSBT construction & finalization |
| `@bitcoinerlab/secp256k1` | secp256k1 ECC backend (Schnorr, key tweaking) |
| `ecpair` | Key pair creation and BIP-341 tweaking for local nsec signing |
| `tiny-secp256k1` | Peer dep of `ecpair` (low-level ECC) |

### 2. Initialize ECC in `main.tsx`

The Buffer polyfill is already imported in mkstack's `main.tsx`. Add the ECC initialization right after it. **`bitcoin.initEccLib(ecc)` must run before any wallet code** — otherwise `payments.p2tr()` and Schnorr operations throw.

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client';

// Import polyfills first (Buffer must exist before bitcoinjs-lib is loaded)
import './lib/polyfills.ts';

// Initialize ECC for bitcoinjs-lib (Taproot / Schnorr support)
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
bitcoin.initEccLib(ecc);

import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
```

`src/lib/bitcoin.ts` calls `initEccLib` again lazily inside signing/finalizing functions as a defensive measure, so test files and ad-hoc imports also work — but the early init in `main.tsx` is what the live app relies on.

### 3. Copy the Skill Files

Copy every file from `files/` into the matching directory under `src/`. The hook files import each other and `@/lib/bitcoin` / `@/lib/bitcoin-signers`, so paths must match exactly.

### 4. Wire the BTC-Capable Signers into `useCurrentUser`

The default `useCurrentUser` uses Nostrify's `NUser.from*Login` factories, which return signers without a `signPsbt` method. Replace them with the BTC-extended subclasses from this skill so the same `user.signer` instance can also sign PSBTs.

Edit `src/hooks/useCurrentUser.ts`:

```tsx
import { useNostr } from '@nostrify/react';
import { type NLoginType, NUser, useNostrLogin } from '@nostrify/react/login';
import { NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useCallback, useMemo } from 'react';

import { useAuthor } from './useAuthor.ts';
import { NSecSignerBtc, NBrowserSignerBtc, NConnectSignerBtc } from '@/lib/bitcoin-signers';

export function useCurrentUser() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();

  const loginToUser = useCallback((login: NLoginType): NUser => {
    switch (login.type) {
      case 'nsec': {
        const sk = nip19.decode(login.data.nsec) as { type: 'nsec'; data: Uint8Array };
        return new NUser(login.type, login.pubkey, new NSecSignerBtc(sk.data));
      }
      case 'bunker': {
        const clientSk = nip19.decode(login.data.clientNsec) as { type: 'nsec'; data: Uint8Array };
        const clientSigner = new NSecSigner(clientSk.data);
        return new NUser(
          login.type,
          login.pubkey,
          new NConnectSignerBtc({
            relay: nostr.group(login.data.relays),
            pubkey: login.data.bunkerPubkey,
            signer: clientSigner,
            timeout: 60_000,
          }),
        );
      }
      case 'extension':
        return new NUser(login.type, login.pubkey, new NBrowserSignerBtc());
      default:
        throw new Error(`Unsupported login type: ${login.type}`);
    }
  }, [nostr]);

  const users = useMemo(() => {
    const users: NUser[] = [];
    for (const login of logins) {
      try { users.push(loginToUser(login)); }
      catch (error) { console.warn('Skipped invalid login', login.id, error); }
    }
    return users;
  }, [logins, loginToUser]);

  const user = users[0] as NUser | undefined;
  const author = useAuthor(user?.pubkey);

  return { user, users, ...author.data };
}
```

This is the **only** change required for the wallet to function across all three login types. If you skip it, the hooks still compile but `useBitcoinSigner` will report `'unsupported'` for every user.

## Core APIs

### Address derivation

```ts
import { nostrPubkeyToBitcoinAddress, npubToBitcoinAddress } from '@/lib/bitcoin';

nostrPubkeyToBitcoinAddress('d6889cb0…300a961d');  // 'bc1p2wsldez…'
npubToBitcoinAddress('npub1…');                    // 'bc1p…'
```

Both return `''` for malformed input or off-curve pubkeys (so UIs can render an empty state without try/catch).

### `useBitcoinWallet()` — current user's wallet

```tsx
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
import { satsToUSD, formatBTC } from '@/lib/bitcoin';

function WalletWidget() {
  const { bitcoinAddress, addressData, btcPrice, transactions, isLoading } = useBitcoinWallet();

  if (isLoading) return <Skeleton className="h-10 w-40" />;
  if (!addressData) return null;

  return (
    <div>
      <div>{btcPrice ? satsToUSD(addressData.totalBalance, btcPrice) : '—'}</div>
      <div>{formatBTC(addressData.totalBalance)} BTC</div>
      <code>{bitcoinAddress}</code>
    </div>
  );
}
```

Auto-refreshes every 30 s (balance + transactions) and 60 s (BTC price).

### `useBitcoinAddress(address)` / `useBitcoinTx(txid)` — NIP-73 detail pages

Use these from the `/:nip19` router (`src/pages/NIP19Page.tsx`) when an `i` tag is `bitcoin:address:bc1p…` or `bitcoin:tx:abc123…`. Both also return the BTC price for USD display.

Parse NIP-73 Bitcoin identifiers with this regex:

```ts
const txMatch  = uri.match(/^bitcoin:tx:([0-9a-f]{64})$/i);
const addrMatch = uri.match(/^bitcoin:address:(.+)$/);
```

### Sending Bitcoin: the PSBT pipeline

The send flow is intentionally split into three pure functions so any signer (local key, NIP-07, NIP-46) can plug in at step 2:

```ts
import {
  buildUnsignedPsbt,
  finalizePsbt,
  broadcastTransaction,
  fetchUTXOs,
  getFeeRates,
} from '@/lib/bitcoin';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const { user } = useCurrentUser();
const { signPsbt, canSignPsbt } = useBitcoinSigner();

if (!canSignPsbt || !signPsbt || !user) throw new Error("Login can't sign PSBTs.");

const senderAddress = nostrPubkeyToBitcoinAddress(user.pubkey);
const [utxos, rates] = await Promise.all([fetchUTXOs(senderAddress), getFeeRates()]);

// 1. Build (no key material required — pubkey only)
const { psbtHex, fee } = buildUnsignedPsbt(
  user.pubkey,
  recipientAddress,
  amountSats,
  utxos,
  rates.halfHourFee, // sat/vB
);

// 2. Sign — dispatched through the user's signer
const signedHex = await signPsbt(psbtHex);

// 3. Finalize + broadcast
const txHex = finalizePsbt(signedHex);
const txid = await broadcastTransaction(txHex);
```

Key facts about `buildUnsignedPsbt`:

- All available UTXOs are consumed as inputs (no coin selection — keep it predictable).
- Fee uses `ceil((numInputs · 57.5 + numOutputs · 43 + 10.5) · feeRate)`.
- Change is added back to the sender's own Taproot address **only** if it's ≥ 546 sats (dust limit). Below dust, change is donated to fees and the tx has 1 output instead of 2.
- Throws `Insufficient funds` if `amount + fee > total UTXO value`.
- Throws `Invalid fee rate` if `feeRate` is not a finite number ≥ 1.

That last guard is load-bearing. A `NaN` fee rate produces a `NaN` fee, and
every check downstream of the fee — the dust comparison, the balance check, the
"is there a fee to show" check in the UI — is a `<` or `>=` comparison, and
*every* comparison with NaN is false. So NaN doesn't fail: it silently skips the
change output, passes the balance check, renders as "Fee 0", and builds a
perfectly valid transaction that pays the wallet's entire balance to miners.
`getFeeRates` sanitizes the remote response for the same reason — the old
`Math.ceil(data['1'] || 1)` caught a *missing* key but turned a truthy
non-number like `{"1": "5"}` into NaN.

For send-max, use `maxSendable(totalBalance, numInputs, feeRate)` — it correctly subtracts a 1-output fee.

### Signer capability detection

`useBitcoinSigner()` returns one of three states for the active login:

| Login | Capability |
|---|---|
| **nsec** | Always `'supported'` — local signing with the private key. |
| **NIP-07 extension** | Probes `window.nostr.signPsbt` (re-tries every 250 ms for up to 3 s). `'supported'`, `'unsupported'`, or `'unknown'` while the extension is still injecting. |
| **NIP-46 bunker** | `'unknown'` initially (NIP-46 has no capability-discovery RPC). Flips to `'unsupported'` for the rest of the session once a `sign_psbt` call returns a "method not found"-style error — see `reportSignerUnsupported()` and `isSignerCapabilityError()`. |

The send dialog should render an "unsupported" panel (with QR-code fallback for receiving funds) whenever `capability === 'unsupported'`, and let `'unknown'` users attempt the send. `useOnchainZap`'s `onError` handler already calls `reportSignerUnsupported(user.pubkey)` automatically, so the second send attempt with the same bunker won't re-attempt.

## Onchain Zaps (kind 8333)

A Bitcoin equivalent of NIP-57 Lightning zaps. Defined in this skill — the kind number mirrors the convention `9735 = Lightning P2P port`, `8333 = Bitcoin mainnet P2P port`.

> If the project has a `NIP.md` file, **document this kind there**. If it doesn't exist, create one with the kind 8333 schema below.

### Event Structure

```json
{
  "kind": 8333,
  "pubkey": "<sender-pubkey>",
  "content": "Great post!",
  "tags": [
    ["i", "bitcoin:tx:<txid>"],
    ["p", "<recipient-pubkey>"],
    ["amount", "<sats>"],
    ["e", "<target-event-id>"],
    ["alt", "Bitcoin zap: 25000 sats"]
  ]
}
```

| Tag | Required | Notes |
|---|---|---|
| `i` | Yes | NIP-73 identifier `bitcoin:tx:<txid>` (64-char lowercase hex). |
| `p` | Yes | Recipient pubkey. |
| `amount` | Yes | Sats paid to the recipient (may be capped by verifier). |
| `e` | If zapping an event | Event being zapped. |
| `a` | If zapping an addressable event (kind 30000–39999) | `<kind>:<pubkey>:<d-tag>`. |
| `alt` | Yes | NIP-31 fallback. |

If neither `e` nor `a` is present, the zap targets the recipient's profile.

### Publishing — `useOnchainZap(target)`

Builds + signs + broadcasts the Bitcoin transaction, then publishes the kind 8333 event:

```tsx
import { useOnchainZap } from '@/hooks/useOnchainZap';

function ZapButton({ target }: { target: NostrEvent }) {
  const { zap, isZapping, progress, canZap } = useOnchainZap(target);

  if (!canZap) return null; // not logged in, self-zap, or PSBT-incapable signer

  return (
    <button
      disabled={isZapping}
      onClick={() => zap({ amountSats: 5000, comment: 'Great post!', feeSpeed: 'halfHour' })}
    >
      {isZapping ? `${progress}…` : 'Zap 5k sats'}
    </button>
  );
}
```

`progress` cycles through `'building' → 'signing' → 'broadcasting' → 'publishing' → 'idle'`.

### Verification — never trust the `amount` tag

The `amount` tag is self-reported. **Always verify on-chain before counting it toward zap totals.** The skill's verifier:

1. Extracts the txid from the `i` tag.
2. Fetches the transaction from mempool.space.
3. Derives the recipient's expected Taproot address from the `p` pubkey.
4. Sums tx outputs paying that address. **Change outputs to the sender are excluded automatically** — they go to a different address.
5. Caps the displayed amount at the verified amount.
6. Rejects events where verified amount = 0, where sender = recipient (self-zap), or where the txid is malformed.

Use `useOnchainZaps(target)` for a list of verified zaps targeting an event, or `useVerifiedOnchainZap(event)` for a single event:

```tsx
import { useOnchainZaps } from '@/hooks/useOnchainZaps';

function OnchainZapList({ target }: { target: NostrEvent }) {
  const { zaps, totalSats, isLoading } = useOnchainZaps(target);
  if (isLoading) return <Skeleton className="h-6 w-24" />;
  return <div>{totalSats.toLocaleString()} sats from {zaps.length} zappers</div>;
}
```

`useOnchainZaps` queries `{ kinds: [8333], '#e': [target.id] }` (and `#a` for addressables), dedupes by txid (preferring the earliest event for any given tx), and verifies each one via mempool.space. Cached for 60 s per (txid, recipient).

### Combining with NIP-57 totals

When showing total zaps for a post, sum verified amounts from **both** kind 9735 (Lightning) and kind 8333 (onchain) — they're complementary settlement layers, not alternatives.

## Mempool.space API Cheat Sheet

All endpoints are public and unauthenticated:

| Endpoint | Used by |
|---|---|
| `GET /address/{addr}` | `fetchAddressData` — balance + tx counts |
| `GET /address/{addr}/txs` | `fetchTransactions` — recent tx history |
| `GET /address/{addr}/utxo` | `fetchUTXOs` — for building send PSBTs |
| `GET /tx/{txid}` | `fetchTxDetail` + zap verifier — full inputs/outputs |
| `GET /fee-estimates` | `getFeeRates` — sat/vB per block target |
| `POST /tx` | `broadcastTransaction` — body is raw tx hex, returns txid |

You can swap to a self-hosted Esplora instance by changing the `MEMPOOL_API` constant in `src/lib/bitcoin.ts`.

## Security Considerations

> **The same private key controls both the user's Nostr identity and the Bitcoin funds at the derived address.** This is by design, but increases the blast radius of every common Nostr-client risk.

- **localStorage nsec is now spendable Bitcoin.** The `nostr-security` skill's XSS warnings apply doubly here. Treat `dangerouslySetInnerHTML`, unsanitized URLs, and CSS injection as on-par with stealing money. Load the `nostr-security` skill before merging anything that touches user input.
- **Extensions and bunkers never see the raw key.** Only the unsigned PSBT (no secret material) is passed to the signer. The PSBT format (BIP-174) carries `witnessUtxo` values and outputs, so a properly-implemented signer can show users what they're signing before approving.
- **Mainnet only.** This skill ships mainnet derivation and uses the public mempool.space API. Testnet/signet support would require a different `network`, a different Esplora endpoint, and is out of scope for kind 8333 verification.
- **Single-key, no HD.** Every Nostr keypair maps to exactly one Bitcoin address. There's no BIP-32 path. This is fine for a wallet tied to identity, but means the user has no way to rotate the address without losing their identity.
- **Users need a backup of their nsec before receiving funds.** Surfacing this to the user (e.g. on the wallet page) is the implementing app's responsibility.
- **Self-zap rejection.** `verifyOnchainZap` already drops events where `event.pubkey === recipient pubkey`. Don't relax this check — self-zaps are trivial to fabricate.

## Testing the Wallet

For end-to-end manual testing without spending real BTC:

1. Generate two Nostr keys (`nak generate` or any client).
2. Send a small amount of mainnet BTC (e.g. 5,000 sats) to key A's derived address.
3. Log in as key A, open the wallet page, confirm balance appears within ~30 s.
4. Use the send flow to forward sats to key B's derived address.
5. Verify the transaction shows up in B's wallet and the kind 8333 event (if zapping a post) is queryable from a relay.

Mempool.space confirms unconfirmed transactions within ~10 s of broadcast and provides a `/tx/<txid>` web view for verification.

## Building UI On Top

This skill provides only the framework. To build the user-facing surfaces:

- **Wallet page** (`/wallet`) — balance + QR code (`bitcoin:<address>`) + tx list. Use `useBitcoinWallet`. Render the QR with the `qrcode` package (`npm install qrcode`).
- **Send dialog** — recipient input (accepts both raw `bc1…` addresses and `npub1…`), amount input with USD conversion, fee-speed selector, confirm/success steps. Use `useBitcoinSigner` to gate the form, `validateBitcoinAddress` for validation, `npubToBitcoinAddress` for npub recipients, and the PSBT pipeline shown above.
- **NIP-73 detail pages** — extend `NIP19Page.tsx` to dispatch `bitcoin:tx:` and `bitcoin:address:` identifiers to detail components powered by `useBitcoinTx` / `useBitcoinAddress`.
- **Onchain zap button** — drop `useOnchainZap` into the existing zap dialog as a Bitcoin tab, alongside Lightning. Show the QR-code BIP-21 fallback (`bitcoin:<address>?amount=<btc>`) when capability is `'unsupported'`.

## References

- [BIP-340: Schnorr Signatures for secp256k1](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki) — shared with NIP-01 keys
- [BIP-341: Taproot](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki) — defines the TapTweak and key-path spend
- [BIP-350: Bech32m](https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki) — `bc1p…` encoding
- [BIP-174: PSBT format](https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki) — what `signPsbt` operates on
- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) — defines secp256k1 x-only keys for Nostr
- [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) — `window.nostr` extension API; `signPsbt` is the optional Bitcoin extension
- [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) — remote signers; `sign_psbt` is the optional Bitcoin command
- [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md) — Lightning zaps (the kind 8333 design mirrors this)
- [NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md) — external content identifiers (`bitcoin:tx:` / `bitcoin:address:`)
- [mempool.space API docs](https://mempool.space/docs/api/rest)
