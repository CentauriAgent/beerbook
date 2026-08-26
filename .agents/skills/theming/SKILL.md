---
name: theming
description: Customize the app's visual design — install Google Fonts via @fontsource, change the color scheme, configure light/dark themes, and apply consistent component styling patterns with Tailwind and CSS variables.
---

# Theming, Fonts, and Color Schemes

Use this skill when the user wants to change fonts, colors, light/dark appearance, or general visual styling. The template ships with a complete light/dark theme system built on CSS custom properties and Tailwind, plus a `useTheme` hook for runtime switching.

## Adding Fonts

Any Google Font can be installed via the `@fontsource` / `@fontsource-variable` packages.

1. **Install the font package.** Prefer the variable version when available.
   ```bash
   npm install @fontsource-variable/inter
   ```
   Package naming:
   - `@fontsource-variable/<font-name>` — variable fonts (preferred; one file, all weights)
   - `@fontsource/<font-name>` — static fonts

2. **Import the font once** in `src/main.tsx`:
   ```ts
   import '@fontsource-variable/inter';
   ```

3. **Register the family** in the `@theme` block of `src/index.css` (Tailwind v4 is CSS-first — there is no `tailwind.config.ts`):
   ```css
   @theme {
     --font-sans: 'Inter Variable', 'Inter', system-ui, sans-serif;
   }
   ```
   This makes `font-sans` (and the default body font) resolve to the new family.

### Suggested families by use case

- **Modern / Clean:** Inter Variable, Outfit Variable, Manrope
- **Professional / Corporate:** Roboto, Open Sans, Source Sans Pro
- **Creative / Artistic:** Poppins, Nunito, Comfortaa
- **Monospace / Code:** JetBrains Mono, Fira Code, Source Code Pro

For expressive hierarchies, pair a sans body font with a display/serif heading font (e.g. Inter + Playfair Display) and expose the second family as another `@theme` token (e.g. `--font-serif` or `--font-display`), which Tailwind turns into a `font-serif` / `font-display` utility.

## Color Schemes

Colors are defined as CSS custom properties in `src/index.css` under two selectors:

- `:root` — light-mode values
- `.dark` — dark-mode overrides

When the user requests a new color scheme:

1. **Update both `:root` and `.dark`** in `src/index.css`. Each variable is a full color value wrapped in `hsl(...)`, e.g. `--primary: hsl(222.2 47.4% 11.2%);`. The `@theme inline` block above maps each `--<token>` to its `--color-<token>` utility, so you don't edit it when only changing values.
2. **Keep contrast ratios ≥ 4.5:1** for body text and interactive elements. Test both modes.
3. **Add new color tokens** under the `@theme inline` block in `src/index.css` (Tailwind v4 is CSS-first — there is no `tailwind.config.ts`). Define the raw value as a `--<token>` on `:root`/`.dark`, then expose it as `--color-<token>: var(--<token>);` inside `@theme inline`.
4. **Apply colors through semantic tokens** (`bg-primary`, `text-muted-foreground`, `border-input`) rather than raw palette names when possible, so future theme changes propagate.

The shadcn/ui components already consume these semantic tokens, so changing the variables automatically restyles the entire component library.

## Light/Dark Theme Switching

The template includes:

- **`useTheme` hook** (`src/hooks/useTheme.ts`) — read and set the current theme programmatically.
- **CSS custom properties** in `src/index.css` — one set in `:root`, dark overrides in `.dark`.
- **Automatic persistence** via the `AppContext` config (`config.theme`), which is saved to local storage.

To add a theme toggle:

```tsx
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
```

## Component Styling Patterns

- **Class merging:** use the `cn()` utility (`@/lib/utils`) to combine conditional classes and override defaults without class-order bugs.
- **Variants:** follow shadcn/ui's `class-variance-authority` pattern for component variants (`variant`, `size`). Copy an existing ui/ component as a template.
- **Responsive design:** lean on Tailwind breakpoints (`sm:`, `md:`, `lg:`) rather than JS media queries. Use `useIsMobile` only when layout must change based on JS-measured viewport.
- **Interactive states:** always define `hover:`, `focus-visible:`, and `disabled:` states for clickable elements. Focus rings should use `ring-ring` / `ring-offset-background` so they pick up theme colors.
- **Spacing:** an 8px grid (Tailwind's default 4-based scale) keeps visual rhythm consistent. Common paddings: `p-4`, `p-6`; gaps: `gap-2`, `gap-4`.
- **Depth:** soft shadows (`shadow-sm`, `shadow-md`), subtle gradients, and `rounded-lg` / `rounded-xl` corners match the template's aesthetic. Avoid heavy drop shadows.

### Negative z-index gotcha

When placing decorative elements behind content with `-z-10` (e.g. blurred background gradients), **add `isolate` to the parent container**. Without `isolate`, the negative z-index escapes the local stacking context and the element disappears behind the page's background color.

```tsx
<section className="relative isolate">
  <div className="absolute inset-0 -z-10 bg-linear-to-br from-primary/20 to-transparent" />
  {/* content */}
</section>
```

## Design Quality Checklist

Before finishing a visual change, verify:

- [ ] Both light and dark modes look correct — no hard-coded colors, all text readable.
- [ ] Contrast ratios meet WCAG AA (≥ 4.5:1 for body, ≥ 3:1 for large text).
- [ ] Interactive elements have visible `hover`, `focus-visible`, and `disabled` states.
- [ ] Layout is responsive down to ~360px width without horizontal scroll.
- [ ] Animations respect `prefers-reduced-motion` (Tailwind: `motion-safe:` / `motion-reduce:`).
- [ ] Spacing is consistent — no one-off `p-[13px]` style values.
