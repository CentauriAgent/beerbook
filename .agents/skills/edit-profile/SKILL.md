---
name: edit-profile
description: Add a form that lets users edit their Nostr profile metadata (NIP-01 kind 0). Provides EditProfileForm with fields for name, about, picture, banner, website, nip05, and a bot flag, plus Blossom image uploads wired up through useUploadFile.
---

# Edit Profile Form

This skill provides `EditProfileForm`, a drop-in React component that lets a logged-in user update their Nostr profile metadata (NIP-01 kind 0). The form covers the common metadata fields, handles image uploads through the project's existing `useUploadFile` hook, publishes a new kind 0 event on save, and invalidates the relevant TanStack Query caches so the rest of the app reflects the change.

**This component is not included in the project by default.** When the user wants profile editing, follow the setup instructions below to install the component.

## Files Provided by This Skill

| Skill file | Copy to |
|---|---|
| `files/components/EditProfileForm.tsx` | `src/components/EditProfileForm.tsx` |

## Setup Instructions

### 1. Dependencies

No extra npm packages are required. The component uses packages already present in the template:

- `react-hook-form` + `@hookform/resolvers` — form state and validation
- `zod` (via `NSchema` in `@nostrify/nostrify`) — metadata schema validation
- `@tanstack/react-query` — cache invalidation after publish
- `@nostrify/nostrify` — `NSchema.metadata()` Zod schema + `NostrMetadata` type
- `lucide-react` — icons
- shadcn/ui — `Button`, `Form`, `Input`, `Textarea`, `Switch`

### 2. Copy the Skill File Into `src/`

Copy `.agents/skills/edit-profile/files/components/EditProfileForm.tsx` into `src/components/EditProfileForm.tsx`. The component imports:

- `@/hooks/useCurrentUser` — current logged-in user and their existing metadata
- `@/hooks/useNostrPublish` — publishes the kind 0 event
- `@/hooks/useToast` — success/error feedback
- `@/hooks/useUploadFile` — Blossom uploads for picture/banner

All of these are standard in the template; no extra work is needed beyond copying the file.

## Usage

Place the component anywhere a logged-in user should be able to edit their profile. It renders the form itself, with no surrounding layout:

```tsx
import { EditProfileForm } from '@/components/EditProfileForm';

export default function EditProfilePage() {
  return (
    <div className="container mx-auto max-w-2xl py-8">
      <h1 className="text-2xl font-semibold mb-6">Edit Profile</h1>
      <EditProfileForm />
    </div>
  );
}
```

The component takes no props. It reads the current user's existing metadata via `useCurrentUser` and pre-populates every field, so the user can tweak values without losing anything else on their profile.

## Fields

| Field | NIP-01 key | Input | Notes |
|---|---|---|---|
| Name | `name` | text | Short handle |
| About | `about` | textarea | Bio / description |
| Picture | `picture` | URL + upload button | Profile avatar. Upload button calls `useUploadFile` and sets the resulting URL. |
| Banner | `banner` | URL + upload button | Profile banner. Same upload flow as picture. |
| Website | `website` | URL | Any related web URL |
| NIP-05 | `nip05` | text | Email-like Nostr identifier (e.g. `alice@example.com`) |
| Bot | `bot` | switch | Marks the account as automated (NIP-24) |

On submit, the component publishes a kind 0 event whose `content` is the JSON-stringified metadata, and invalidates any `useAuthor`/profile queries so the UI reflects the new values immediately.

## Routing

The form is just a component. If you want a dedicated route for it, wire it up in `AppRouter.tsx`:

```tsx
// AppRouter.tsx
import EditProfilePage from './pages/EditProfilePage';

<Route path="/settings/profile" element={<EditProfilePage />} />
```

## Related Hooks

If you're building a profile page that *displays* the user's metadata (as opposed to editing it), use:

- `useCurrentUser` — the logged-in user and their metadata
- `useAuthor(pubkey)` — any user's metadata by pubkey

Both are part of the core template.
