# @kestack/web-theme

The one look of every kstack web app: the colour tokens for Tailwind v4, Inter, and the light or dark Theme saved in a shared cookie and set before the first paint.

## Big picture

Every kstack app and the Auth Worker's sign-in pages are drawn in one look:
the same tokens (`background`, `card`, `foreground`, `muted-foreground`,
`border`, `primary` and the rest, in shadcn's names), Inter, and one Theme.
The Theme is light or dark, the system's setting until a choice is saved;
a choice is saved in the `kui-theme` cookie on the Shared Cookie Domain, so
it holds in every app under it, and the head script sets it on `<html>`
before the first paint.

It sits below `@kestack/web-platform`, which re-exports it from its
`./theme` subpath, and below `@kestack/auth-toolkit`, whose pages bundle it
at build time. Neither can depend on the other for it without a cycle, which
is why it is its own package
([ADR 0010](../../docs/adr/0010-the-theme-is-a-package-below-the-web-platform.md)).
An app on the Web Platform imports it through the Web Platform.

What each token is for, their values, the contrast they were checked at,
and how the Theme is switched are in [docs/design.md](./docs/design.md).

## Install

```sh
pnpm add @kestack/web-theme react
pnpm add -D tailwindcss @tailwindcss/vite
```

- `react`: `createTheme`'s hook and head Script, `FontPreload` and the Status Bar strip are React.
- `tailwindcss`: `theme.css` is Tailwind v4 CSS (`@theme`, `@custom-variant`, `@apply`); import it after `tailwindcss`.

## Exports

### `@kestack/web-theme`

| Export             | What it does                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTheme`      | Makes an app's Theme for a `cookieDomain`: `useTheme`, the head `Script` that sets it before paint, the `StatusBar` strip, and `manifest` colours for a Theme. |
| `FontPreload`      | Preloads Inter's Latin file from the head, the same file `font-inter.css` uses, so the first paint is already in Inter.                                        |
| `themeFromCookies` | Reads the saved Theme from a `Cookie` header string, under `kui-theme` or the legacy `theme`; undefined when none is saved.                                    |
| `THEME_COOKIE`     | The cookie's name, `kui-theme`.                                                                                                                                |
| `THEME_SCRIPT`     | The head script's source, for a page drawn without React: the saved Theme, else the system's, on `<html>` before the first paint.                              |

### `@kestack/web-theme/theme.css`

| Export      | What it does                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| `theme.css` | The tokens as Tailwind theme variables, the `dark:` variant on `data-theme`, and the page's colours and font. |

### `@kestack/web-theme/font-inter.css`

| Export           | What it does                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `font-inter.css` | Inter and JetBrains Mono as variable fonts, and `Inter Fallback` sized to Inter's metrics. |

## Usage

### A page in the shared Theme

The Auth Worker's pages, a Kabuki Start app that can't use the Web
Platform's Document, draw their head and toggle with this package directly.
Lifted from `toolkits/auth-toolkit/src/worker/app`.

```tsx
// document.tsx
const theme = createTheme();

export default function Document({ children }: Start.DocumentProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Start.Head />
        <FontPreload />
        <theme.Script />
      </head>
      <body>
        {children}
        <Start.Scripts />
      </body>
    </html>
  );
}

// views/theme.tsx
export function ThemeToggle({ cookieDomain }: { cookieDomain: string }) {
  const { useTheme } = useMemo(
    () => createTheme({ cookieDomain }),
    [cookieDomain],
  );
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      onClick={toggleTheme}
    >
      <Moon className="dark:hidden" />
      <Sun className="hidden dark:block" />
    </button>
  );
}
```

```css
/* styles.css */
@import 'tailwindcss';
@import '@kestack/web-theme/theme.css';
@import '@kestack/web-theme/font-inter.css';
```

- `theme.Script` renders a `theme-color` per system setting, then the
  script that sets `data-theme` on `<html>` from `kui-theme` (or the legacy
  `theme`), else from `prefers-color-scheme`, before the body paints.
- `toggleTheme` saves the cookie on `cookieDomain` when the page's host is
  under it, switches the root at once with transitions held for a frame,
  and tells every other `useTheme` on the page.
- The icon follows `data-theme` in CSS, so it is right on the first paint;
  `theme` from the hook is `light` on the server and settles on hydration.
- Set `--brand-accent` on `:root` and `primary` follows it.
