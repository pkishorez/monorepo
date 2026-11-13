---
'@kestack/kabuki': patch
---

Core is now the Definition, the Snapshot, the Runtime and the History, and the Runtime is a Snapshot kept alive.

- `Snapshot.init`, `Snapshot.next` (was `play`), `Snapshot.save` and `Snapshot.load` make, step and save the app as plain data. A Snapshot is `{ root, at }`. An Instance repeats its State's tag as `_tag`, so a check on it narrows `state` and `children`, and no longer has `started` or `changed`.
- `Runtime.make(actor, { snapshot, layer })` runs a Snapshot. `runtime.root` and `runtime.at(address)` give a live Instance to walk and Send through. `runtime.follow(snapshot)` makes the running app match a Snapshot, changing only what differs, or with `restart: true` starts all work again. `runtime.subscribe` tells its listener the entries played.
- The Runtime keeps no History: `runtime.history`, `fork`, `seek`, `keep`, `window`, `send`, `workers` and `instance` are gone. A History is kept beside a Runtime: `History.init(snapshot)`, `add`, `move`, `entries`, `all`, `snapshot`, `replay`, `compact`, `save` and `load`. An entry is `{ to, message, from, at }`, and a History's entry adds `id` and `parent`.
- There is no Restore Message. A History starts from a Snapshot, and Compacting moves that start forward. A saved History is `{ start, entries, head }`, so one saved before no longer loads.
- `Snapshot.replay`, `Snapshot.seek` and `Snapshot.trail` are gone: use `History.snapshot`, `History.replay`, and a filter over `History.entries`.
- React: `<Kabuki of>` takes a Runtime or a Snapshot. `useRuntime()` gives `history`, `window`, `keep` and `startOver`, which starts the app over from init, and no longer `workers` or `instance`. `Step` is exported from `@kestack/kabuki/react/types`.
