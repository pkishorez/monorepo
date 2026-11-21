---
'@kestack/devtools-kabuki': patch
---

**Added**

- `@kestack/devtools-kabuki/fake`, the Fake World: `FakeWorld.make(fakes, { saved })` runs each Fake (`{ name, actor, controls, serve, kept? }`) on a Kabuki Runtime of its own in the Layer's Scope, merges every Fake's `serve` into one Layer, and lists the Runtimes running (`runtimes`, `subscribe`).
- Each Fake's Snapshot kept across reloads: started from the one saved under its name, saved on every change once it settles (`kept` of it when the Fake has one), in the tab's IndexedDB with `FakeWorld.indexedDb()`.
- Start fresh: `FakeWorld.startFresh()` reloads the tab, and `FakeWorld.beforeStart()`, called first thing, then deletes every IndexedDB database of the origin, localStorage and sessionStorage.
