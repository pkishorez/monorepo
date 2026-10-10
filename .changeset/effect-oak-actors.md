---
'effect-oak': patch
---

Breaking: Nodes are now Actors, and the app is one immutable Snapshot.

- `Node.make` is now `Actor.make`. `Actor.many(X)` declares keyed Children, and `build({ invoke })` says which keys exist and what Input each Child starts from, per State.
- Instance IDs are deterministic (`Auth/todos#2`, `List/rows[a]#1`) and Messages are addressed by ID.
- `init` returns only the Model and State. A Lifetime is a scoped Effect `(self) => Effect`, for the whole Instance (`'*'`) or per State. A Command may Send any number of Messages, is owned by its Instance, and can run under a `key`; `cancel` interrupts it by key. `replaceCommands` is gone.
- Provides is a Layer, built once each time its State is entered. `self` (`send`, `get`, `changes`) gives an Instance's own work its current data.
- `Runtime.start` returns `stop`, `start` and `show` as Effects, where a new one interrupts the one still running. Replay yields to the main thread and keeps Snapshots along the Log.
- Views take a `Handle` and get `ViewProps<A>`: `id`, `model`, `state`, `children`, `send` and `frame`.
