---
'@kestack/web-platform': patch
---

`AppShell` takes `vim={{ on, statusLine }}`: given it, on a screen at least 1624px wide the whole shell floats as a window, at most 1600 by 1200, centred, rounded, with a layered shadow over a soft backdrop; narrower, it stays the whole screen. It is the same whether Vim Mode is on or off, so reading Vim Mode after the first paint never moves the page; with Vim Mode on, the status line eases in as its bottom edge. `AppShell` also takes `column`, which wraps the page's column, header included, such as in a `keys.Surface asChild`. The new `recipes/keyboard` gives `KeysStatusBar`, whose path leaves out Surfaces that are not Focusable, and `KeysHelp`, which take the app's `keys` from use-keys' `createKeys`, and `SurfaceScrim`. The theme draws every Surface from its data attributes: the Active one is lit by a layer over it, a faint edge and a soft inward glow, brighter in Insert Mode, that fades in over 100ms and leaves its borders as they are; Inactive ones dim, Parent ones stay plain, and Surfaces in a dialog stay unlit. `--surface-*` and `--vim-window-*` variables tune both, and `appearance` classes override them; while Vim Mode is on, dialogs, popovers, menus and the frame open and close at once.

While Vim Mode is on, the sidebar also opens and shuts at once instead of springing.
