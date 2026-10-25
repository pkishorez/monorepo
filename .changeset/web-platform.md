---
'@kestack/web-platform': patch
---

The Web Platform is for apps on Kabuki Start, in four modules: `ui`, `pwa`, `recipes` and `app`.

- Breaking: every import path changes, and the TanStack Start parts are gone.
- `app`: `app({ name, platform, app })` is every Vite plugin, `document({ theme })` the Document, and `app/alchemy` gives `Site` and `State`.
- `pwa()` needs only a name. Offline, each page follows its Render Mode, and a page marked `private` or `no-store` is never saved.
- Touch: `Drawer`, `TopDialog`, `SwipeRow` either way, pull to refresh, no focus ring on touch, and `AppShell`'s `sidebarMode`.
- Keyboard: `recipes/keyboard` with `KeysStatusBar` and `KeysHelp`; `recipes/account-switcher`; `recipes/devtools`.
