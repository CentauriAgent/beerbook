---
name: capacitor
description: Wrap the mkstack web app as a native iOS and Android application using Capacitor. Provides haptics, native file downloads / share sheet, OS-level secure storage (Keychain / KeyStore), deep-link routing, status-bar theme sync, and safe-area CSS utilities.
---

# Capacitor Native Wrapper

This skill turns the web app into a native iOS and Android binary using [Capacitor](https://capacitorjs.com/) — no Swift or Kotlin required for the basics. The React UI runs unchanged inside a native WebView; the helpers below provide the cross-platform primitives that make it feel native.

**Not included in the project by default.** Run the setup below when the user wants to ship to an app store or produce an `.apk` / `.ipa`.

## What this skill provides

| Capability | Web behavior | Native behavior |
|---|---|---|
| **Haptics** (`impactLight`, `notificationSuccess`, …) | `navigator.vibrate()` on Android browsers | Taptic engine / Android haptics |
| **`downloadTextFile(filename, content)`** | `<a download>` click | Writes to app Documents directory |
| **`openUrl(url)`** | `window.open(url, '_blank')` | Native share sheet |
| **`secureStorage` / `useSecureLocalStorage`** | `localStorage` | iOS Keychain / Android KeyStore, auto-migrates plaintext values |
| **`<DeepLinkHandler />`** | no-op | Forwards OS `appUrlOpen` into React Router |
| **`bootstrapNative()`** | no-op | Hides iOS keyboard accessory bar; syncs system-bar icon style with theme |
| **Safe-area utilities** (Tailwind) | `env(safe-area-inset-*)` | `env(safe-area-inset-*)` + `SystemBars` back-fill on Android |

Every helper is SSR-safe and web-safe — import and call unconditionally from shared components. Each source file ships with a JSDoc header covering the exact API, gotchas, and usage examples; read them after copying.

## Files to copy

Copy from `.agents/skills/capacitor/files/` into the matching project location:

| Skill file | Copy to |
|---|---|
| `files/lib/haptics.ts` | `src/lib/haptics.ts` |
| `files/lib/downloadFile.ts` | `src/lib/downloadFile.ts` |
| `files/lib/secureStorage.ts` | `src/lib/secureStorage.ts` |
| `files/lib/nativeBootstrap.ts` | `src/lib/nativeBootstrap.ts` |
| `files/hooks/useSecureLocalStorage.ts` | `src/hooks/useSecureLocalStorage.ts` |
| `files/components/DeepLinkHandler.tsx` | `src/components/DeepLinkHandler.tsx` |
| `files/capacitor.config.ts` | `capacitor.config.ts` (project root — edit `appId`, `appName`, `scheme`, background colors) |
| `files/scripts/patch-cap-config.mjs` | `scripts/patch-cap-config.mjs` — only needed if you add **local** (non-SPM) native plugin classes; otherwise skip |
| `files/safe-area-shim.css` | `src/safe-area-shim.css` — **only if** you need Android WebView <140 support (see shim file header and troubleshooting below) |

## Setup

### 1. Install

```bash
# Runtime + plugins
npm install @capacitor/core @capacitor/app @capacitor/filesystem \
  @capacitor/haptics @capacitor/keyboard @capacitor/share \
  capacitor-secure-storage-plugin

# Toolchain
npm install -D @capacitor/cli @capacitor/android @capacitor/ios

# Safe-area utilities (Tailwind v4 — this project)
npm install -D tailwindcss-safe-area
```

mkstack ships **Tailwind v4** with CSS-first config (`@import "tailwindcss"` in `src/index.css`, no `tailwind.config.ts`). If you're adapting these instructions to a Tailwind v3 project, install `tailwindcss-safe-area@0.8.0` instead and register it in `tailwind.config.ts`'s `plugins` array — `1.x` emits no utilities on v3.

### 2. Copy the skill files

Copy every file from the table above.

### 3. Register the safe-area plugin

Add a second `@import` to `src/index.css`, right after the existing `@import "tailwindcss";`:

```css
@import "tailwindcss";
@import "tailwindcss-safe-area";
@import "tw-animate-css";
```

**Use `@import`, not `@plugin`.** The package ships a plain CSS file for Tailwind v4, not a JS plugin entry point.

### 4. Fill in `capacitor.config.ts`

Edit `appId` (reverse-DNS; **cannot be changed after publishing**), `appName`, `ios.scheme`, and the iOS/Android `backgroundColor` values. All other defaults in the skill's config are production-safe.

### 5. Update `index.html`

iOS won't expose `env(safe-area-inset-*)` without `viewport-fit=cover`:

```html
<meta name="viewport"
  content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
```

### 6. Wire up bootstrap and deep links

Call `bootstrapNative()` **before** React mounts, so system bars are themed at first paint:

```tsx
// src/main.tsx
import { bootstrapNative } from '@/lib/nativeBootstrap';
bootstrapNative();
createRoot(document.getElementById('root')!).render(<App />);
```

Render `<DeepLinkHandler />` **inside** `<BrowserRouter>` so `useNavigate()` works:

```tsx
// src/AppRouter.tsx
<BrowserRouter>
  <DeepLinkHandler />
  <ScrollToTop />
  {/* <Routes>…</Routes> */}
</BrowserRouter>
```

**A deep link is an untrusted navigation.** Any web page the user visits can
open `myapp://whatever` — no prompt, no gesture beyond the tap that got them to
the page. `DeepLinkHandler` turns that into a `navigate()` call, so a custom
scheme lets an attacker put the user on any route in your app. Universal links
(`https://`) are safer, since the OS only routes them to you after verifying
`apple-app-site-association` / `assetlinks.json`, but the app has no way to tell
the two apart once the event arrives.

So: **no route may perform a side effect on mount.** A route that publishes an
event, follows a user, sends a payment, or deletes something as soon as it
renders is an action any website can trigger silently. Render a confirmation
the user has to click instead. If your app has no custom scheme, restricting
the handler to `url.protocol === 'https:'` is worth doing as well.

### 7. Add platforms and build

```bash
npx cap add android
npx cap add ios          # macOS only

npm run build            # produces dist/
npx cap sync             # copies dist/ into android/ and ios/

npx cap open android     # Android Studio; hit Run
npx cap open ios         # Xcode (macOS only); hit Run
```

Commit the generated `android/` and `ios/` directories (signing keys stay excluded via the generated `.gitignore`s). If you later add a **local** (non-SPM) Capacitor plugin class, append `node scripts/patch-cap-config.mjs` to your sync command so `packageClassList` survives each `npx cap sync`.

## Using the APIs

Each file's JSDoc header has full usage details. Quick tour:

```tsx
import { impactLight, notificationSuccess } from '@/lib/haptics';
import { downloadTextFile, openUrl } from '@/lib/downloadFile';
import { secureStorage } from '@/lib/secureStorage';
import { useSecureLocalStorage } from '@/hooks/useSecureLocalStorage';

impactLight();                                         // fire-and-forget
notificationSuccess();                                 // silent no-op on unsupported platforms

await downloadTextFile('export.json', JSON.stringify(data));
await openUrl('https://example.com');

await secureStorage.setItem('nwc:active', conn);
await secureStorage.getItem('nwc:active');

const [conn, setConn, ready] = useSecureLocalStorage<string | null>('nwc:active', null);
if (!ready) return <Spinner />;                        // native reads are async
```

## Safe-area utilities

Once step 3 is done, `*-safe` utilities are available for padding, margin, position, height, border, and scroll properties. The most useful ones:

- `pt-safe`, `pb-safe`, `px-safe`, `py-safe`, `p-safe` (also logical `ps-`/`pe-` and `start-`/`end-` positions)
- `top-safe`, `bottom-safe`, `inset-safe`, `inset-x-safe`
- `h-dvh-safe`, `min-h-dvh-safe`, `h-svh-safe`, `h-lvh-safe`, `h-screen-safe`
- `{prop}-safe-offset-{n}` — safe area **plus** `{n}` (`pb-safe-offset-4` = inset + 1rem)
- `{prop}-safe-or-{n}` — `max(safe-area, {n})` (`pb-safe-or-8` = at least 2rem)

```tsx
<header className="sticky top-0 pt-safe">…</header>
<nav className="fixed inset-x-0 bottom-0 pb-safe">…</nav>
<Dialog className="h-dvh-safe">…</Dialog>
<footer className="pb-safe-or-8">…</footer>
```

Full list: [plugin README](https://github.com/mvllow/tailwindcss-safe-area).

## Common follow-ups

- **App icons / splash screen** — standard icon generator → `android/app/src/main/res/mipmap-*/` and `ios/App/App/Assets.xcassets/AppIcon.appiconset/`. For splash, add `@capacitor/splash-screen` and configure under `plugins.SplashScreen`.
- **Push notifications** — add `@capacitor/push-notifications` (FCM / APNs); the web side keeps using Web Push.
- **Deep-link verification** — host `apple-app-site-association` and `assetlinks.json` on your domain so the OS opens verified `https://` links directly. Full checklist in the `DeepLinkHandler.tsx` header.
- **Nsec autofill via iCloud Keychain / Credential Manager** — add `@capgo/capacitor-autofill-save-password` and wrap it analogously to `secureStorage`.

## Troubleshooting

- **Safe-area utilities render as `0` on Android** — Chromium WebView <140 reports `env(safe-area-inset-*)` as `0` ([bug 40699457](https://issues.chromium.org/issues/40699457)). `SystemBars` (`insetsHandling: 'css'`, already set) injects `--safe-area-inset-*` CSS variables, but `tailwindcss-safe-area` uses `env(…)` directly. **Preferred fix:** target WebView 140+ (Aug 2025; auto-updated on Android ≥7). **Fallback:** copy `files/safe-area-shim.css` to `src/` and `@import` it **after** `@import "tailwindcss-safe-area";` so the variables take over when `env()` is 0.
- **`pt-safe` doesn't exist** — either `@import "tailwindcss-safe-area";` is missing / in the wrong position (must come **after** `@import "tailwindcss";`), or you installed `0.8.0` (v3-only) on a v4 project. `npm ls tailwindcss-safe-area` should show `>=1.0.0`.
- **Safe-area is 0 on iOS Safari / simulator** — missing `viewport-fit=cover` in the `<meta name="viewport">` tag.
- **Deep links don't navigate** — `<DeepLinkHandler />` must be **inside** `<BrowserRouter>`; `useNavigate()` throws silently otherwise.
- **iOS keyboard still shows the accessory bar** — `bootstrapNative()` must run **before** any `<input>` is focused. Invoke at the top of `main.tsx`.

Remaining edge cases (`secureStorage` returning `null` after debug reinstall, status-bar theming with custom CSS-variable setups) are covered in the corresponding file headers.
