---
'effect-oak': patch
---

A Child reads Props from its parent. An Actor declares `props` beside `input`; the parent hands them in `invoke` after each of its Updates, as `{ key, input, props }` for a keyed Child and `{ input, props }` for a fixed one, which used to be its Input alone. The Child's Update, its Workers' Conditions, `self.get` and `self.changes`, and its View read them as `props`; a change runs none of its rules, keeps the Instance while they stay equal, and starts or stops the Workers that read them. A View no longer takes data props from its parent View: `View.make` draws from the Instance alone, and a parent hands it only `instance`, `ref` and `style`.

A Log entry is only its Envelope: `{ id, parent, destination, message, source, at }`. `instance` is now `destination`, and `outcome`, `from` and `to` are gone: `Running.outcome(id)`, `useRuntime().outcome(id)` and `outcomeOf` work out whether an entry was handled, ignored or dropped. A Source is a tagged union: `view`, `command` and `worker` name their Instance, `provide` is a Send from a Capability outside any Command or Worker, `outside` is a Send from code outside the tree, now the default for `Running.send`, and `restore` has no Instance. Replay plays every entry, and warns once of and skips one whose Message, or whose Update's data, no longer fits its Schemas.
