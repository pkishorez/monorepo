---
'@kestack/kabuki': patch
---

Kabuki is rebuilt around three parts: the Actor and its Blueprint, the app's data (Address, History, Snapshot), and one Runtime per app, running or stopped, that Seeks any Step and Forks in place. Breaking.

**Added**

- `actor.blueprint` and `Blueprint.at`: what an Actor is and does, as plain data, with nothing running: for the top and each State, the Messages it handles, its Workers, Children, Queries and the Capabilities it Provides. Every tool reads it instead of the engine.
- `Address`: an Instance's one canonical ID, `App/Inside:downloads#2/files[3]#1`, now naming the State a Child is written in. `Address.parse`, `parent`, `place`, `within` and `check`; an Address taken from a Snapshot types what can be sent to it.
- `Snapshot.trail(actor, history, address, upTo?)`: one Instance's story along the History, up to any entry, when it started, each Message sent to it, each that changed it, and when it stopped. Every Instance in a Snapshot carries the History entry that `started` it and the one that last `changed` it.
- `Snapshot.workers(actor, snapshot, address)`: the Workers the data asks for at an Instance, by name and, for one of `each`, key, by the rule a running Runtime runs them by. Compare it before and after an entry to see which Workers the entry started or stopped.
- `Runtime.make(actor, { input, history, layer, window })` and `Runtime.scoped` for Effect code: the app's one Runtime, running from the moment it is made, and running none of the Head's Commands. `runtime.running` says whether it runs.
- `runtime.stop()` stops every Worker, Provide and Command, and Time with it; `runtime.send` then throws `Stopped` and adds nothing. `runtime.start()` runs again at the Head: Workers and Provides start from its data, and no past Command runs again.
- `runtime.fork(entry | null)`: moves the same Runtime's Head to any entry, or init, so the next Message grows a new Branch. Running, its work starts again from that entry's data, running no Command; stopped, only the Head moves.
- `runtime.seek(entry | null)`: the app right after any entry, on any Branch, as a `Step`, the plain data `{ entry, at, snapshot }`, changing nothing.
- `History.tips(history)`: the last entry of every Branch.
- `<Kabuki of={runtime | step} view={AppView} />`, from `@kestack/kabuki/react`: a Runtime is drawn at its Head and a click Sends while it runs; a Step is drawn as it is and a click does nothing.

**Changed**

- `provides` names what it gives: `provides: { capabilities: [Session], layer: (self) => Layer }`. A Layer that builds a Capability not named, or misses one named, is a type error, and only the named ones reach descendants.
- A slot name is used once per Actor: a State's Child can no longer take the name of one written at the top.
- History is plain data, `{ input, entries, head }`, with `History.make`, `add`, `go`, `line`, `children`, `entry`, `compact`, `save`, `load` and `restored`; its Window is a Runtime option. A History entry is `{ id, parent, to, message, from, at }`.
- A Snapshot is `{ entry, root }`, and an Instance's `id` is its `address`; it no longer holds `key`. `Snapshot<A>` and `Instance<A>` are typed by their Actor: `state`, `model` and `props` are its own, and each Child in `children` is its Actor's `Instance`, a list for `each`, optional when written in a State or there only `while` a test holds. So `runtime.snapshot.root.children.files[0].address` is that Child's `Address`, and `runtime.send` takes only its Messages. `Instance` with no Actor stays untyped, for tools, and a typed one is assignable to it.
- `AppRuntime<A>` (from `useRuntime()`) is assignable to `AppRuntime`, so an Attachment or tool written for any app takes a typed one.
- `View.app`'s `useRuntime()` gives `runtime`, the same one for the app's whole mount, `seeking`, `seek(entry | null)` (`null`: init, as with `runtime.seek`), `toHead()` (draws the Head again), `fork(entry | null)`, `start`, `stop`, `workers`, `instance`, `failure` and `subscribe`. A Fork no longer makes a new Runtime.
- `@kestack/kabuki/core/history` and `@kestack/kabuki/core/snapshot` are now `@kestack/kabuki/core/data`.

**Removed**

- `Runtime.start` (use `Runtime.make` or `Runtime.scoped`), the `live` option and `runtime.live` (use `runtime.running`, `stop()` and `start()`), `useRuntime()`'s `show`, `shown` and `clear` (use `seek`, `toHead`, `seeking` and `fork(null)`), `runtime.provided`, `Snapshot.handle` and `Snapshot.instanceAt` (use `Snapshot.play` and `Snapshot.at`), the engine's `ActorDefinition` types from the public API, and `actorAt`, `isRestore` and `remember` from `@kestack/kabuki/core/data` (kabuki's own).
- `@kestack/kabuki/core/command` (import `Command` from `@kestack/kabuki` or `@kestack/kabuki/core/actor`).
