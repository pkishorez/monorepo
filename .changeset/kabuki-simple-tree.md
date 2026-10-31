---
'@kestack/kabuki': patch
'@kestack/connect': patch
'@kestack/devtools': patch
'@kestack/web-platform': patch
'@kestack/ai-toolkit': patch
'@kestack/auth-toolkit': patch
'@kestack/std-toolkit': patch
---

Kabuki's paths are reorganized. This is a breaking change.

- A layer's path gives only the values an app is made of. `@kestack/kabuki` gives `Actor`, `Command`, `History` and `Runtime`. `@kestack/kabuki/react` gives `View`, `useChild` and `useChildren`. `@kestack/kabuki/routing` gives `Page`, `Router`, `Navigation` and `useRouter`. `@kestack/kabuki/start` gives `Start`.
- Each folder is now a path of its own that gives its value and every type that goes with it, and nothing else: `@kestack/kabuki/core/actor`, `core/command`, `core/history`, `core/runtime`, `core/snapshot`, `react/view`, `routing/page`, `routing/router`, `routing/capabilities` and `start/app`. For example, `import type { Running } from '@kestack/kabuki/core/runtime'`.
- Some values moved to a folder path:
  - `Stopped` → `core/runtime`
  - `useLive` → `react/view`
  - `useElementScrollRestoration` → `routing/router`
  - `Loading`, with `Loading.memory` and `Loading.cached` (formerly `Router.memory` and `Router.cached`) → `routing/capabilities`
  - `handle`, `instanceAt` and `isMany` → `Snapshot.handle`, `Snapshot.instanceAt` and `Snapshot.isMany`, from `core/snapshot`
- No longer exported: `Replay`, `outcomeOf`, `init`, `restore`, `isRestore`, `isHistory`, `lazyOf` and `RUN`. Use `history.seek`, `history.snapshotAt` and `history.outcome` instead of the replay helpers.
- `toReact(actor, view, layer, options)` is now `View.app(view, { layer, ...options })`. The Layer may be left out while the tree Requires nothing.
- `Router.app(router, AppView)` returns the Router's View, which `View.app` starts at the browser's URL: `View.app(Router.app(router, AppView), { layer })`. It no longer needs `.view` or `input: startAt`.
- The `Page.NotFound` and `Page.Redirect` types are now `NotFoundError` and `RedirectTo`, and the `Start.DocumentProps` type is `DocumentProps` from `@kestack/kabuki/start/app`.
- The adapters have shorter paths: `@kestack/kabuki/routing/browser`, `@kestack/kabuki/routing/tanstack`, `@kestack/kabuki/start/cloudflare` and `@kestack/kabuki/start/nitro`.
- Inside, each layer is regrouped:
  - React is `react/view`, with its drawing in `react/view/draw`.
  - The Router is split into one file per job, with the address adapter and scroll restoration under it.
  - Start's shared part is `start/app`, with `start/app/protocol` for what the server and the browser agree on.
  - Command has a folder of its own.
  - Helpers that only other layers use sit in nested folders that no path exports.

The other packages move to the new paths. What they do does not change.
