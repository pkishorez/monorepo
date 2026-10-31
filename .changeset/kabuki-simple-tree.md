---
'@kestack/kabuki': patch
'@kestack/connect': patch
'@kestack/devtools': patch
'@kestack/web-platform': patch
'@kestack/ai-toolkit': patch
'@kestack/auth-toolkit': patch
'@kestack/std-toolkit': patch
---

Kabuki's API is now namespaces, in Effect's way, with their types inside. This is a breaking change.

- `@kestack/kabuki` gives `Actor`, `Command`, `History`, `Runtime` and `Snapshot`. `ActorType` is `Actor.Actor`, `AnyActor` is `Actor.Any`, `ActorDefinition` is `Actor.Definition`, `Self` is `Actor.Self`, `Running` is `Runtime.Running`, `LiveInstance` is `Runtime.Instance`, `Stopped` is `Runtime.Stopped`, `Instance` is `Snapshot.Instance`, the `History` type is `History.History`, `SavedHistory` is `History.Saved`, `Entry` is `History.Entry`, `CommandType` is `Command.Command`, `ActorOf` is `Actor.Of`, and `handle`, `instanceAt` and `isMany` are `Snapshot.handle`, `Snapshot.instanceAt` and `Snapshot.isMany`. `Replay`, `outcomeOf`, `init`, `restore` and `isRestore` are no longer exported: `history.seek`, `history.snapshotAt` and `history.outcome` cover them.
- `toReact(actor, view, layer, options)` is `View.app(view, { layer, ...options })`. The Layer may be left out while the tree Requires nothing. `ViewProps`, `ViewOf`, `LazyView`, `Handle`, `Root`, `ChildData`, `AppRuntime` and `Attachment` are `View.Props`, `View.Of`, `View.Lazy`, `View.Handle`, `View.Root`, `View.ChildData`, `View.AppRuntime` and `View.Attachment`. `lazyOf` is no longer exported.
- `PageDefinition`, `PageBuild`, `Status` and `Metadata` are `Page.Definition`, `Page.Build`, `Page.Status` and `Page.Metadata`. `Preload` is `Router.Preload`, and `Answer` is `Loading.Answer`. `Router.memory` and `Router.cached` are `Loading.memory` and `Loading.cached`.
- The adapters have shorter paths: `@kestack/kabuki/routing/browser`, `@kestack/kabuki/routing/tanstack`, `@kestack/kabuki/start/cloudflare` and `@kestack/kabuki/start/nitro`.
- Inside, each layer is regrouped: React's files are `react/view` and `react/app`; the Router is split into one file per job, with the address adapter and scroll restoration under it; Start's shared part is `start/app`, with `start/app/protocol` for what the server and the browser agree on.

The other packages move to the new names. What they do does not change.
