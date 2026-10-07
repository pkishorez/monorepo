# Ledger design rules

Grayscale, quiet, and the same on every device. Read before changing a screen.

## Colour

Only web-platform tokens. `pnpm lint:colors` fails on a Tailwind palette colour
(`emerald-500`) or a raw hex, rgb, hsl or oklch value.

| Token                             | Where                                                                  |
| --------------------------------- | ---------------------------------------------------------------------- |
| `foreground` / `muted-foreground` | Text that leads / text that supports, icons, the Out bar, budget bars  |
| `border`                          | Every card, row divider, pill and input                                |
| `accent`                          | Hover, the marked row, the active sidebar item                         |
| `primary`                         | The one filled thing: the chosen pill, the main button, the Add button |
| `muted`                           | Bar tracks, the In bar (`muted-foreground/50`)                         |
| `destructive`                     | Trouble only: over budget, a negative balance left, Delete             |
| `popover`                         | The Key Bar, the palette, dialogs                                      |

Money in has a `+`, money out a `−`; neither has a colour. Categories are told
apart by icon and name, never by hue.

## Focus

One ring: `focus-ring` (styles.css), 2px of `ring` drawn inside the element,
so a scrolling parent never clips its top or bottom. web-platform controls keep
their own ring. Never `outline: none` without a replacement.

## Layout

A Place sizes itself to the page, not the window: the page is
`@container/page` (`app/parts/page.tsx`), so use `@md:`, `@xl:`, `@3xl:`.
`@3xl` (48rem) is where Entries shows the list and the Entry side by side;
in code, `useWide()`. Window breakpoints (`sm:`) are only for overlays: the
Add sheet, dialogs, the palette. Whether the sidebar docks is the App Shell's.

## Keyboard or touch

Decided by the device, never the width (web-platform's `input`):

| Variant     | True when                                  | Shows                          |
| ----------- | ------------------------------------------ | ------------------------------ |
| `keyboard:` | A mouse that hovers, or a key pressed      | The header's Add button        |
| `touch:`    | Any coarse pointer                         | The round Add button           |
| `keys:`     | `keyboard:` and Keys on in Settings        | Every key hint (`BindingKeys`) |
| `gestures:` | `touch:` and the Thumb Lock on in Settings | Gesture hints                  |

A laptop with a touch screen gets both. `BindingKeys` hides itself without
`keys:`; pass `always` only where keys are the subject (Settings, palette).

## Motion

Under 200 ms, `cubic-bezier(0.23, 1, 0.32, 1)`, transform and opacity only.
Nothing that floats (the Key Bar, the Place Picker) moves what is under it. Feedback
is for multi-finger gestures and keys; a tap needs none.
