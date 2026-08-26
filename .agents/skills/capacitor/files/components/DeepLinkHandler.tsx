import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

/**
 * Forwards OS-level deep-link opens into the React Router navigation stack.
 *
 * When the OS launches your app via a URL (a `https://your-domain.com/post/123`
 * universal link or a `myapp://post/123` custom-scheme link), Capacitor fires
 * an `appUrlOpen` event. This component listens for it and calls
 * `navigate(pathname + search + hash)` so the app lands on the intended
 * in-app route instead of staying on whatever page it was on.
 *
 * Must be rendered **inside** a `<BrowserRouter>` (so `useNavigate` works).
 * Safe to render unconditionally — on web it is a no-op.
 *
 * ## Deep links are untrusted input
 *
 * Any web page the user visits can open `myapp://anything`, which arrives here
 * and becomes a `navigate()` call. Universal links are verified by the OS;
 * custom schemes are not, and the `appUrlOpen` event does not distinguish
 * them. Treat the destination as attacker-chosen: **no route may perform a
 * side effect on mount** (publishing an event, following, paying, deleting).
 * Such a route is an action any website can trigger without the user knowing.
 * Require a click on the page instead. Apps with no custom scheme should also
 * reject anything but `url.protocol === 'https:'` below.
 *
 * To enable deep links:
 *
 * **iOS (Universal Links):**
 * 1. Add your domain under *Signing & Capabilities → Associated Domains*
 *    as `applinks:your-domain.com`
 * 2. Host an `apple-app-site-association` file at
 *    `https://your-domain.com/.well-known/apple-app-site-association`
 *
 * **iOS (custom scheme):**
 * 1. Set `ios.scheme` in `capacitor.config.ts`
 * 2. Capacitor already registers the scheme in Info.plist's
 *    `CFBundleURLSchemes` during `npx cap sync`
 *
 * **Android (App Links):**
 * 1. Declare an `<intent-filter android:autoVerify="true">` with your
 *    domain in `android/app/src/main/AndroidManifest.xml`
 * 2. Host a `assetlinks.json` file at
 *    `https://your-domain.com/.well-known/assetlinks.json`
 *
 * **Android (custom scheme):**
 * 1. Add an `<intent-filter>` with `<data android:scheme="myapp" />` in
 *    the manifest
 *
 * @example
 *   // In AppRouter.tsx, inside BrowserRouter:
 *   <BrowserRouter>
 *     <DeepLinkHandler />
 *     <ScrollToTop />
 *     <Routes>...</Routes>
 *   </BrowserRouter>
 */
export function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    async function setup() {
      const { App } = await import('@capacitor/app');

      // Handle URLs opened while the app is already running
      const listener = await App.addListener('appUrlOpen', (event) => {
        try {
          const url = new URL(event.url);
          const path = url.pathname + url.search + url.hash;
          if (path) {
            navigate(path);
          }
        } catch {
          // Invalid URL, ignore
        }
      });

      cleanup = () => listener.remove();
    }

    setup();

    return () => {
      cleanup?.();
    };
  }, [navigate]);

  return null;
}
