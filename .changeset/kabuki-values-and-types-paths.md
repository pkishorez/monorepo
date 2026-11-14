---
'@kestack/kabuki': patch
---

Kabuki's import paths are cut from 21 to 11: each Part has one path for its values and one for its types. Breaking.

- `@kestack/kabuki`, `/react`, `/routing` and `/start` give values only. Their types are at `@kestack/kabuki/types`, `/react/types`, `/routing/types` and `/start/types`.
- `/start/server` and `/start/vite` stay; `/start/client` stays for the browser entry the plugin writes.
- Removed: `/core/actor`, `/core/data`, `/core/runtime`, `/react/view`, `/routing/page`, `/routing/router`, `/routing/capabilities`, `/routing/adapter`, `/routing/browser`, `/routing/tanstack`, `/start/app`, `/start/platform`, `/start/cloudflare` and `/start/nitro`.
- `useLive` is on `@kestack/kabuki/react`; `Loading`, `browser`, `tanstack`, `useElementScrollRestoration` and `useKeepScrollAnchor` are on `@kestack/kabuki/routing`.
- `cloudflare()` and `nitro()` are on `@kestack/kabuki/start/vite`, beside `start`. Their `serve` functions are `serveCloudflare` and `serveNitro` on `@kestack/kabuki/start/server`.
