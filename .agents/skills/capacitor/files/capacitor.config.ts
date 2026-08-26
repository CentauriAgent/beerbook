import type { CapacitorConfig } from '@capacitor/cli';

// ── Fill in your app identity before running `npx cap add android` / `ios`. ──
// The appId must be a reverse-DNS-style identifier (e.g. `com.example.myapp`)
// and cannot be changed later without re-registering the app with the stores.

const config: CapacitorConfig = {
  appId: 'com.example.myapp',
  appName: 'MyApp',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  android: {
    // Disallow loading mixed-content (http:// inside https://).
    allowMixedContent: false,
    // Background color shown behind the web view before first paint.
    // Usually your app's dark-theme background so the splash feels seamless.
    backgroundColor: '#14161f',
  },
  ios: {
    backgroundColor: '#14161f',
    // `never` prevents WKWebView from inset-adjusting scroll content — the
    // app handles safe-area insets itself in CSS via env(safe-area-inset-*).
    contentInset: 'never',
    // Custom URL scheme for deep-links (e.g. `myapp://…`) — match this
    // in your Info.plist CFBundleURLSchemes.
    scheme: 'MyApp',
  },
  plugins: {
    SystemBars: {
      // Inject --safe-area-inset-* CSS variables on Android to work around
      // a Chromium bug (<140) where env(safe-area-inset-*) reports 0.
      insetsHandling: 'css',
    },
  },
};

export default config;
