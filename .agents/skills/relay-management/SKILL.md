---
name: relay-management
description: Add a UI for users to view, add, remove, and configure their NIP-65 relay list with per-relay read/write permissions. Publishes kind 10002 events via useNostrPublish and keeps AppContext in sync.
---

# Relay List Manager (NIP-65)

This skill provides `RelayListManager`, a drop-in settings UI that lets the user inspect and edit their NIP-65 relay list. Each row has a URL plus read/write switches, with an add/remove flow and automatic NIP-65 (kind 10002) publishing when the user is logged in.

**The underlying NIP-65 relay state is already active in the template** — it lives in `AppContext`, is synced on login by `NostrSync`, and persists to local storage. This skill only adds the *UI* for managing that state; the core wiring stays untouched.

**This component is not included in the project by default.** When the user wants a relay settings screen, follow the setup instructions below to install the component.

## Files Provided by This Skill

| Skill file | Copy to |
|---|---|
| `files/components/RelayListManager.tsx` | `src/components/RelayListManager.tsx` |

## Setup Instructions

### 1. Dependencies

No extra npm packages are required. The component uses packages already present in the template:

- `lucide-react` — icons (`Plus`, `X`, `Wifi`, `Settings`)
- shadcn/ui — `Button`, `Input`, `Label`, `Switch`, `Popover`

### 2. Copy the Skill File Into `src/`

Copy `.agents/skills/relay-management/files/components/RelayListManager.tsx` into `src/components/RelayListManager.tsx`. The component imports:

- `@/hooks/useAppContext` — reads and updates `config.relayMetadata.relays`
- `@/hooks/useCurrentUser` — determines whether to publish a NIP-65 event on change
- `@/hooks/useNostrPublish` — publishes kind 10002 events
- `@/hooks/useToast` — user feedback

All of these are standard in the template; no extra work is needed beyond copying the file.

## Usage

Drop the component anywhere you want a relay settings panel — typically a dedicated settings page:

```tsx
import { RelayListManager } from '@/components/RelayListManager';

export default function SettingsPage() {
  return (
    <div className="container mx-auto max-w-2xl py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section>
        <h2 className="text-lg font-medium mb-3">Relays</h2>
        <RelayListManager />
      </section>
    </div>
  );
}
```

The component takes no props. It reads from and writes to `AppContext` directly, so any other piece of the app that consumes `useAppContext` (including the `nostr` pool via `NostrProvider`) will automatically see the updated relay list.

## Behavior

- **Read-only state source:** `config.relayMetadata.relays` from `AppContext`
- **Write path:** `updateConfig(...)` updates local storage; if a user is logged in, a kind 10002 event is also published via `useNostrPublish` so the new list is broadcast to the user's relays
- **URL normalization:** Input URLs are trimmed and normalized (e.g. a bare hostname becomes `wss://hostname`) before being added
- **Read/write flags:** Each relay exposes independent `read` and `write` switches (NIP-65 semantics)
- **Sync effect:** An effect keeps local state in sync with external `AppContext` changes (e.g. when `NostrSync` loads the user's relay list on login)

## NIP-65 Recap

NIP-65 defines kind 10002 ("Relay List Metadata") as a replaceable event containing `r` tags for each relay, optionally annotated with `read` / `write` markers:

```
["r", "wss://relay.ditto.pub"]           // both read and write
["r", "wss://relay.example.com", "read"] // read-only
["r", "wss://writer.example.com", "write"] // write-only
```

The project's `NostrSync` component reads this event on login and writes the parsed list into `AppContext`. `RelayListManager` is the inverse — it edits `AppContext` and publishes a new kind 10002 when the user changes their list.

## Related

- **`NostrSync`** (`src/components/NostrSync.tsx`) — runs on login, fetches the user's kind 10002 event, writes it into `AppContext`. Stays in src/ because it's core to the template's login flow.
- **`AppContext`** (`src/contexts/AppContext.ts`) — holds the live relay list used by `NostrProvider`. Stays in src/ for the same reason.
