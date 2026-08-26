---
name: nwc
description: Add Nostr Wallet Connect (NWC), WebLN wallet detection, and Lightning zap functionality (NIP-57) to the application. Use when the user wants to connect a Lightning wallet, send zaps, or display zap counts on Nostr events.
---

# Nostr Wallet Connect (NWC) & Lightning Zaps

This skill adds Lightning wallet connectivity and zap (NIP-57) functionality. It is **not included in the project by default**. When the user wants to add wallet/zap features, follow the setup instructions below to install the files, wire up the provider, and add the required dependencies.

## What This Skill Provides

- **NWC** (Nostr Wallet Connect, NIP-47) — connect remote Lightning wallets via `nostr+walletconnect://` URIs
- **WebLN detection** — auto-detect browser extension wallets (Alby, Mutiny, etc.)
- **NIP-57 Zaps** — create zap requests, fetch LNURL invoices, pay them via NWC/WebLN/QR fallback
- **UI components** — `ZapButton`, `ZapDialog`, `WalletModal` ready to drop into the app

## Files Provided by This Skill

All files live under `.agents/skills/nwc/files/` and must be copied into `src/` preserving the directory structure:

| Skill file | Copy to |
|---|---|
| `files/hooks/useNWC.ts` | `src/hooks/useNWC.ts` |
| `files/hooks/useNWCContext.ts` | `src/hooks/useNWCContext.ts` |
| `files/hooks/useWallet.ts` | `src/hooks/useWallet.ts` |
| `files/hooks/useZaps.ts` | `src/hooks/useZaps.ts` |
| `files/lib/bolt11.ts` | `src/lib/bolt11.ts` |
| `files/lib/lnurlPay.ts` | `src/lib/lnurlPay.ts` |
| `files/contexts/NWCContext.tsx` | `src/contexts/NWCContext.tsx` |
| `files/components/WalletModal.tsx` | `src/components/WalletModal.tsx` |
| `files/components/ZapDialog.tsx` | `src/components/ZapDialog.tsx` |
| `files/components/ZapButton.tsx` | `src/components/ZapButton.tsx` |

## Setup Instructions

### 1. Install Dependencies

Add these packages to the project:

```bash
npm install @getalby/sdk @webbtc/webln-types
```

- `@getalby/sdk` — NWC client used by `useNWC.ts` to open connections and pay invoices
- `@webbtc/webln-types` — TypeScript types for the browser WebLN provider

`ZapDialog` also uses the `qrcode` package to render invoices. It should already be installed in the project (it's used by `src/components/ui/qrcode.tsx`). If it's missing for any reason, also run `npm install qrcode && npm install --save-dev @types/qrcode`.

### 2. Copy the Skill Files Into `src/`

Copy every file listed in the table above from `.agents/skills/nwc/files/` into its corresponding location under `src/`. Preserve the exact paths — the files use `@/hooks/...` / `@/contexts/...` / `@/components/...` imports that depend on these locations.

### 3. Wire Up the `NWCProvider` in `src/App.tsx`

The `NWCProvider` must wrap any component that uses NWC, wallet, or zap hooks/components. Place it inside `NostrProvider` (it depends on a logged-in user) and around `TooltipProvider`:

```tsx
// Add this import near the other provider imports at the top of src/App.tsx
import { NWCProvider } from '@/contexts/NWCContext';

// Then wrap TooltipProvider with NWCProvider inside the existing provider tree:
export function App() {
  return (
    <UnheadProvider head={head}>
      <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig}>
        <QueryClientProvider client={queryClient}>
          <NostrLoginProvider storageKey='nostr:login'>
            <NostrProvider>
              <NostrSync />
              <NWCProvider>
                <TooltipProvider>
                  <Toaster />
                  <Suspense>
                    <AppRouter />
                  </Suspense>
                </TooltipProvider>
              </NWCProvider>
            </NostrProvider>
          </NostrLoginProvider>
        </QueryClientProvider>
      </AppProvider>
    </UnheadProvider>
  );
}
```

### 4. Wire Up `NWCProvider` in `src/test/TestApp.tsx` (if tests need it)

If you're writing tests that mount components depending on NWC/zap/wallet hooks, wrap `TestApp`'s provider tree the same way:

```tsx
import { NWCProvider } from '@/contexts/NWCContext';

// ...
<NostrProvider>
  <NWCProvider>
    <BrowserRouter>
      {children}
    </BrowserRouter>
  </NWCProvider>
</NostrProvider>
```

## Hooks

Once installed and wired up, the following hooks are available:

| Hook | Purpose |
|---|---|
| `useNWC` (from `@/hooks/useNWCContext`) | Manage NWC connections — `addConnection`, `removeConnection`, `setActiveConnection`, `getActiveConnection`, `sendPayment` |
| `useWallet` | Unified wallet status — returns `{ hasNWC, webln, activeNWC, preferredMethod }` |
| `useZaps` | Zap functionality — fetch zap receipts/totals, create invoices, pay via NWC/WebLN, fallback to QR |

### `useNWC`

```tsx
import { useNWC } from '@/hooks/useNWCContext';

function MyComponent() {
  const {
    connections,        // NWCConnection[]
    activeConnection,   // string | null (connection string of active wallet)
    addConnection,      // (uri: string, alias?: string) => Promise<boolean>
    removeConnection,   // (connectionString: string) => void
    setActiveConnection,// (connectionString: string) => void
    getActiveConnection,// () => NWCConnection | null
    sendPayment,        // (connection, invoice, expectedAmountMsat) => Promise<{ preimage: string }>
  } = useNWC();
}
```

Connections are persisted to `localStorage` under the keys `nwc-connections` and `nwc-active-connection`.

### `useWallet`

```tsx
import { useWallet } from '@/hooks/useWallet';

function ZapContext() {
  const { hasNWC, webln, activeNWC, preferredMethod } = useWallet();
  // preferredMethod: 'nwc' | 'webln' | 'manual'
}
```

`useWallet` combines NWC connection state with the browser's global `window.webln` to give a single source of truth for "can this user pay a Lightning invoice right now, and how?"

### `useZaps`

```tsx
import { useZaps } from '@/hooks/useZaps';
import { useWallet } from '@/hooks/useWallet';
import type { Event } from 'nostr-tools';

function MyZapTotal({ event }: { event: Event }) {
  const { webln, activeNWC } = useWallet();
  const { zapCount, totalSats, zap, isZapping, invoice } = useZaps(event, webln, activeNWC);
  return <div>{totalSats} sats from {zapCount} zaps</div>;
}
```

The `zap(amount, comment)` function will:
1. Look up the author's LNURL endpoint from their profile's `lud16`/`lud06`
2. Create and sign a NIP-57 zap request
3. Fetch a Lightning invoice from the LNURL service
4. **Decode the invoice and reject it unless it charges exactly the requested amount**
5. Try to pay it via NWC (preferred), then WebLN, then expose the invoice for QR/manual payment
6. Show toast feedback and invalidate zap query caches on success

### Never pay an invoice you haven't read

Step 4 is not optional. The LNURL endpoint is chosen by the **recipient**, so the
invoice it returns is attacker-controlled whenever the recipient is hostile:
anyone who posts a note and runs their own pay server otherwise decides how much
their victims spend, *after* the victim has approved a figure. A user who
approves 776 sats can be charged 5,000,000, and — since the wallet is handed only
the invoice string — nothing downstream will notice.

`lib/bolt11.ts` provides `assertInvoiceAmount(invoice, expectedMsat)`, which
decodes the BOLT11 and throws unless the amount matches exactly. Amountless
invoices are rejected outright, since they let the wallet or payee pick the sum.
`useNWC.sendPayment` takes the approved amount and re-checks it, so no caller can
hand a wallet an unvetted invoice.

If you add another payment path, put the check in front of it. Do not use a
regex on the human-readable part for this — that is a display heuristic, not an
authentication check.

## Components

### `ZapButton`

Drop-in button that shows total sats for an event and opens a zap dialog when clicked. Hides itself automatically if the viewer isn't logged in, is the author, or the author has no Lightning address.

```tsx
import { ZapButton } from '@/components/ZapButton';

<ZapButton target={event} />
```

Pre-computed zap data can be passed in to avoid extra queries in feed views:

```tsx
<ZapButton target={event} zapData={{ count: 5, totalSats: 1234, isLoading: false }} />
```

### `ZapDialog`

The full zap flow UI (amount presets, custom amount, comment, invoice QR). Usually rendered indirectly via `ZapButton`, but can be used standalone for custom triggers:

```tsx
import { ZapDialog } from '@/components/ZapDialog';

<ZapDialog target={event}>
  <button>Send a zap</button>
</ZapDialog>
```

### `WalletModal`

Settings UI for connecting/removing NWC wallets and viewing WebLN status. Good for a wallet settings page or a header icon:

```tsx
import { WalletModal } from '@/components/WalletModal';

// Default trigger button
<WalletModal />

// Or custom trigger
<WalletModal>
  <Button variant="ghost"><Wallet /></Button>
</WalletModal>
```

## Payment Method Priority

When a user sends a zap, the skill tries payment methods in this order:

1. **NWC** — if there is an active connection in `useNWC`, `sendPayment` is called with the fetched invoice
2. **WebLN** — if `window.webln` exists, it's `enable()`d (if needed) and used to pay the invoice
3. **Manual/QR** — the invoice is exposed as a QR code and `lightning:` URI; the user pays from any wallet

Errors at each stage fall through to the next method, with a toast explaining what happened.

## Protocol Notes

- **NIP-47 (NWC)** — wallet connection strings start with `nostr+walletconnect://` (or legacy `nostrwalletconnect://`). The `@getalby/sdk` `LN` client handles the underlying encrypted request/response events with the wallet service pubkey over relays defined in the URI.
- **NIP-57 (Zaps)** — `nip57.makeZapRequest` builds the kind-9734 zap request. For addressable events (kinds 30000–39999) the skill passes the event object (so an `a` tag is included); for all other kinds it passes just the event id (so an `e` tag is included). The zap request is **signed but not published** — it's sent directly to the LNURL endpoint in the query string, which returns a BOLT11 invoice.
- **LNURL** — resolved from the author's `lud16` (email-style) or `lud06` (bech32) metadata field by `lib/lnurlPay.ts`. It does not use `nip57.getZapEndpoint`, which returns only the callback URL and discards the `minSendable`/`maxSendable` bounds and the `metadata` string needed to validate the response. HTTPS is required for both the LNURL and the callback it names.
- **Zap receipts** — kind 9735 events published by the LNURL service after payment. The skill queries them by `#e` (regular events) or `#a` (addressable events) and sums sats from the `amount` tag, BOLT11 invoice, or zap request description (in that order of preference).

## Tips

- **Loading the skill doesn't modify the project.** You must actually copy the files and edit `App.tsx` and `package.json` as described above. Without the provider, every hook will throw `"useNWC must be used within a NWCProvider"`.
- **Place `ZapButton` next to other engagement buttons** (reply, repost, like) on posts. It returns `null` for self-authored posts and authors without a Lightning address, so it's safe to render unconditionally.
- **Don't store connection strings anywhere else.** NWC connection strings contain a secret key. The skill keeps them in `localStorage` only; treat them like passwords.
- **The `WebLNProvider` type import is `import type { WebLNProvider } from '@webbtc/webln-types';`** — types-only, so it disappears at build time.
