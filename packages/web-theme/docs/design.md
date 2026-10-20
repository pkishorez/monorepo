# The Theme: colours, type and light or dark

One look for every kstack web app and the Auth Worker's pages: a quiet,
ink-on-paper surface in a cool hue (265), a page colour behind white
surfaces in light, the same ink inverted in dark. Everything below traces to
`src/css/theme.css` or `src/theme`; a token not listed here does not exist.
Adding one means adding it to the code and to this file together.

## Tokens

Use the Tailwind utility for the token (`bg-card`, `text-muted-foreground`);
never a raw hex, an `oklch()`, a palette class (`gray-200`) or an opacity
that stands in for a token. `dark:` follows the root's `data-theme`, so it is
safe, but a token that already switches is better than a `dark:` pair.

| Token                                                | Light                                                             | Dark                                                         | Use                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `background`                                         | `oklch(0.982 0.002 265)`                                          | `oklch(0.155 0.004 265)`                                     | The page, `body` only                                             |
| `card`, `popover`, `dialog`, `sidebar`               | `oklch(1 0 0)`                                                    | `oklch(0.195 0.005 265)`                                     | Raised surfaces: cards, menus, dialogs, inputs, secondary buttons |
| `foreground` (and every `*-foreground` on a surface) | `oklch(0.22 0.008 265)`                                           | `oklch(0.95 0.003 265)`                                      | Titles, body, row titles                                          |
| `muted-foreground`                                   | `oklch(0.5 0.01 265)`                                             | `oklch(0.7 0.008 265)`                                       | Leads, details, captions, group labels                            |
| `faint`                                              | `oklch(0.55 0.008 265)`                                           | `oklch(0.6 0.008 265)`                                       | Fine print, dates after a detail, disabled labels                 |
| `muted`, `secondary`                                 | `oklch(0.955 0.003 265)`                                          | `oklch(0.25 0.006 265)`                                      | Quiet fills: icon tiles, skeletons, code boxes, an Active band    |
| `accent`, `sidebar-accent`                           | `oklch(0.965 0.003 265)`                                          | `oklch(0.235 0.006 265)`                                     | The hover fill: rows, ghost buttons, menu items                   |
| `border`, `input`, `edge`, `sidebar-border`          | `oklch(0.194 0.031 269.3 / 0.09)`                                 | `oklch(0.285 0.006 265)`                                     | The hairline: dividers, 1px rings, input edges                    |
| `primary`, `sidebar-primary`                         | `--brand-accent`, else `oklch(0.25 0.01 265)`                     | `--brand-accent` at 82% chroma, else `oklch(0.94 0.004 265)` | The one next step: primary button, brand mark, a picked item      |
| `primary-foreground`                                 | white on a dark primary, black on a light one                     | the same                                                     | Text on `primary`                                                 |
| `primary-hover`                                      | `primary` 12% toward black                                        | `primary` 12% toward white                                   | Hover on `primary`                                                |
| `ring`, `sidebar-ring`                               | `oklch(0.22 0.008 265 / 0.75)`                                    | `oklch(0.95 0.003 265 / 0.75)`                               | Focus only; ink, never the brand                                  |
| `destructive`, `destructive-soft`                    | `oklch(0.52 0.18 25)`, `oklch(0.96 0.025 25)`                     | `oklch(0.75 0.14 25)`, `oklch(0.26 0.05 25)`                 | Errors, and the one action that ends things                       |
| `warning`, `warning-soft`                            | `oklch(0.47 0.1 70)`, `oklch(0.965 0.035 85)`                     | `oklch(0.82 0.11 85)`, `oklch(0.26 0.04 80)`                 | Read this before going on                                         |
| `positive`, `positive-soft`                          | `oklch(0.52 0.13 155)`, `oklch(0.96 0.03 155)`                    | `oklch(0.75 0.13 155)`, `oklch(0.27 0.04 155)`               | Done, in use now                                                  |
| `destructive-foreground`, `positive-foreground`      | white                                                             | `oklch(0.155 0.004 265)`                                     | Text on a solid `destructive` or `positive`                       |
| `scrim`                                              | `oklch(0 0 0 / 0.3)`                                              | `oklch(0 0 0 / 0.55)`                                        | Dialog backdrop                                                   |
| `sidebar-active`, `sidebar-active-foreground`        | `oklch(0.94 0.03 265)`, `oklch(0.4 0.16 265)`                     | `oklch(0.25 0.045 265)`, `oklch(0.78 0.12 265)`              | The Sidebar's current item                                        |
| `chart-1` to `chart-5`                               | ink from `oklch(0.87 0.004 265)` down to `oklch(0.269 0.008 265)` | the same                                                     | Neutral series                                                    |
| `chart-6` to `chart-9`                               | indigo, amber, teal, pink                                         | each 0.05 lighter                                            | Coloured series                                                   |

The brand accent is the page's: set `--brand-accent` on `:root` to any CSS
colour and `primary`, `primary-hover` and `primary-foreground` follow it. The
Auth Worker sets it from its `brand.accent`.

`THEME_COLORS` in `src/theme/model.ts` holds `background` as hex (`#f8f9fa`,
`#0b0c0e`) for the `theme-color` meta, the manifest and the root's colour
before the stylesheet arrives. Change both together.

### Contrast

Checked with WCAG 2 and APCA on `background`, `card` and `muted`; every
text token passes WCAG AA (4.5:1) on the page and on a card in both themes,
and the state colours pass on their `-soft` fills. On `muted`, light `faint`
is 4.26:1: there it only labels a disabled button, which WCAG exempts. In light,
`faint` moved from L 0.56 to 0.55 (4.42:1 to 4.61:1 on the page) and
`positive` from 0.55 to 0.52 (4.33:1 to 4.90:1); nothing else changed. Two
things knowingly stay below a floor:

- APCA in dark is lower than WCAG suggests: `muted-foreground` is Lc 50 and
  `faint` Lc 35 on the page. Keep both at 14px and up and never for a line
  someone must read to go on.
- `border` is a hairline (about 1.2:1): it separates, it never identifies a
  control on its own. An input also has a label and its surface.

## Depth

Through `shadow-(--token)`: `--shadow-raised` (cards), `--shadow-control`
(secondary buttons), `--shadow-overlay` (menus, dialogs), `--shadow-edge`
(an avatar picture's edge). In light each is a `border` ring plus soft
layers; in dark it collapses to the ring, since shadows barely show on a
dark page. Separation inside a surface (row dividers, an input's edge) stays
a `border`, never a shadow.

## Type

Inter, from `font-inter.css`, with `Inter Fallback` (Arial sized to Inter's
metrics) so a late font moves nothing; `FontPreload` in the head makes the
late font rare. `font-mono` (JetBrains Mono) for codes and paths only.

## Light or dark

Two Themes, no "System" choice: until the visitor picks one, the system's
setting is followed, live. Pressing a toggle saves `kui-theme=light|dark`
for a year on the Shared Cookie Domain when the page's host is under it
(`createTheme({ cookieDomain })`), so a choice in one app holds in every app
and in the sign-in pages under that domain. A choice saved under the old
name, `theme`, is read too, and moved to `kui-theme` once.

The root is switched one way, by the head script before the first paint
and by `applyThemeToDocument` after: `data-theme` on `<html>` (which every
token and `dark:` follow), the colour scheme, the root's and body's colour,
and every `theme-color` tag. A switch holds every transition for one frame
so nothing fades across. A server that reads the cookie may render
`data-theme` itself; with nothing saved it renders none, and the script
decides. A Theme read in JavaScript (`useTheme().theme`) is `light` on the
server and settles on hydration, so anything that must be right on the
first paint follows `data-theme` in CSS (`dark:hidden`), not the hook.
