---
'@kestack/web-platform': patch
---

The Theme is now `@kestack/web-theme`'s, re-exported from `./theme`, and it is the Auth Worker's palette: a cool page colour behind white cards in light, and the same ink inverted in dark. New tokens: `faint`, `primary-hover`, `destructive-soft`, `warning`, `warning-soft`, `positive-soft`, `scrim`, and the `--shadow-raised`, `--shadow-control`, `--shadow-overlay` and `--shadow-edge` shadows. `primary` follows `--brand-accent` when a page sets it.

Breaking: with no saved choice the Theme is the system's, not dark. `themeFromCookies` and `getTheme` return undefined when nothing is saved. `Script` takes no `initialTheme`, and `webRoot`'s `loadTheme` may resolve to undefined. The root is switched by `data-theme` alone, with no `dark` class: write `[data-theme='dark']` where CSS matched `.dark`, and `data-theme="dark"` to force a subtree dark. A choice saved in the Auth Worker's old `theme` cookie is read and moved to `kui-theme`. `THEME_SCRIPT` is the head script for a page drawn without React.
