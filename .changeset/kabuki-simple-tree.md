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

- A layer's path gives only the values an app is made of. `@kestack/kabuki` gives `Actor`, `Command`, `History` and `Runtime`. `@kestack/kabuki/react` gives `View`, `useChild`, `useChildren` and `useLive`. `@kestack/kabuki/routing` gives `Page`, `Router`, `Navigation`, `Loading`, `useRouter` and `useElementScrollRestoration`. `@kestack/kabuki/start` gives `Start`.
- Types moved off the layer paths. Each folder is now a path of its own that gives its value and every type that goes with it: `@kestack/kabuki/core/actor`, `core/command`, `core/history`, `core/runtime`, `core/snapshot`, `react/view`, `routing/page`, `routing/router`, `routing/capabilities` and `start/app`. For example, `import type { Running } from '@kestack/kabuki/core/runtime'`.
- `Stopped` comes from `@kestack/kabuki/core/runtime`. `handle`, `instanceAt` and `isMany` are `Snapshot.handle`, `Snapshot.instanceAt` and `Snapshot.isMany`, from `@kestack/kabuki/core/snapshot`. `Replay`, `outcomeOf`, `init`, `restore` and `isRestore` come only from their folder paths.
- `toReact(actor, view, layer, options)` is now `View.app(view, { layer, ...options })`. The Layer may be left out while the tree Requires nothing. `lazyOf` comes from `@kestack/kabuki/react/view`.
- `Router.memory` and `Router.cached` are now `Loading.memory` and `Loading.cached`. The `Page.NotFound` and `Page.Redirect` types are now `NotFoundError` and `RedirectTo`, and the `Start.DocumentProps` type is `DocumentProps` from `@kestack/kabuki/start/app`.
- The adapters have shorter paths: `@kestack/kabuki/routing/browser`, `@kestack/kabuki/routing/tanstack`, `@kestack/kabuki/start/cloudflare` and `@kestack/kabuki/start/nitro`.
- Inside, each layer is regrouped. React is `react/view`, with its drawing in `react/view/draw`. The Router is split into one file per job, with the address adapter and scroll restoration under it. Start's shared part is `start/app`, with `start/app/protocol` for what the server and the browser agree on. Command has a folder of its own.

The other packages move to the new paths. What they do does not change.
