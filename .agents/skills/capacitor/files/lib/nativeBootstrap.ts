import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

/**
 * One-time Capacitor-native bootstrap: configures system chrome to match
 * the active CSS theme and hides the iOS keyboard accessory bar.
 *
 * Call this from `src/main.tsx` **before** `createRoot(...).render(...)`.
 * On web this is a no-op.
 *
 * What it does on native:
 *
 * 1. Hides the iOS keyboard accessory bar (the prev/next/done toolbar above
 *    the keyboard) — most apps don't need it and it steals screen space.
 *
 * 2. Keeps the native system bar icon style (clock, battery, etc.) in sync
 *    with the active CSS theme. When the app is on a dark background, icons
 *    are rendered light; on a light background, dark. This is re-applied
 *    whenever:
 *      - the `class` on `<html>` changes (light / dark / any custom theme
 *        that toggles a class, e.g. your AppProvider)
 *      - the contents of `<style id="theme-vars">` change (custom themes
 *        that set CSS variables without toggling a class)
 *
 * Uses `SystemBars` (exposed by the Capacitor-core plugin registry). On
 * Android 16+ (API 36) setBackgroundColor on the bars no longer works — the
 * bars are transparent and the web content renders behind them. Your app
 * should draw its own safe-area backgrounds in CSS. Only icon style matters
 * here.
 *
 * @example
 *   // src/main.tsx
 *   import { bootstrapNative } from '@/lib/nativeBootstrap';
 *   bootstrapNative();
 *   createRoot(document.getElementById('root')!).render(<App />);
 */
export function bootstrapNative(): void {
  if (!Capacitor.isNativePlatform()) return;

  // iOS-only: hide the keyboard accessory bar.
  if (Capacitor.getPlatform() === 'ios') {
    import('@capacitor/keyboard').then(({ Keyboard }) => {
      Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
    }).catch(() => {});
  }

  /**
   * SystemBarsStyle.Dark  = light/white icons (use on dark backgrounds)
   * SystemBarsStyle.Light = dark/black icons  (use on light backgrounds)
   */
  function updateStatusBar() {
    const isDark = isBackgroundDark();
    SystemBars.setStyle({
      style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    }).catch(() => {});
  }

  // Apply immediately. The theme class is usually set synchronously by the
  // AppProvider useLayoutEffect before the first React paint, but we still
  // try early in case it's already set.
  updateStatusBar();

  // Re-apply whenever the theme class changes on <html>.
  const classObserver = new MutationObserver(() => updateStatusBar());
  classObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });

  // Re-apply whenever the injected <style id="theme-vars"> content changes
  // (covers custom themes that change CSS variables without changing the
  // class).
  const styleObserver = new MutationObserver(() => updateStatusBar());
  const observeThemeVars = () => {
    const el = document.getElementById('theme-vars');
    if (el) {
      styleObserver.observe(el, {
        characterData: true,
        childList: true,
        subtree: true,
      });
    }
  };
  observeThemeVars();
  // The style element may not exist yet — watch <head> for it to appear.
  const headObserver = new MutationObserver(() => observeThemeVars());
  headObserver.observe(document.head, { childList: true });
}

/**
 * Detect whether the current app background is "dark" for the purposes of
 * choosing status-bar icon color.
 *
 * Strategy (first match wins):
 *   1. If `<html>` has class `dark`, return true.
 *   2. If `<html>` has class `light`, return false.
 *   3. Parse the computed `background-color` of `<body>` and compare its
 *      perceived luminance against 0.5.
 *
 * Steps 1 and 2 cover the default mkstack theme system. Step 3 covers
 * custom themes that don't toggle the `light`/`dark` class on `<html>`.
 */
function isBackgroundDark(): boolean {
  const cl = document.documentElement.classList;
  if (cl.contains('dark')) return true;
  if (cl.contains('light')) return false;

  const bg = getComputedStyle(document.body).backgroundColor;
  const rgb = parseRgb(bg);
  if (!rgb) return false;

  // Perceived luminance (ITU-R BT.709).
  const [r, g, b] = rgb.map((c) => c / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.5;
}

function parseRgb(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
