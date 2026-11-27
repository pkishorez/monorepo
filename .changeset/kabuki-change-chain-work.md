---
'@kestack/kabuki': patch
---

`Snapshot.changes(actor, before, after)` says what changed between two Snapshots, per Instance: added or removed with its data, its State before and after, each Model and Props field before and after, and the Workers started and stopped. `instance.try` gives the same `changes`. What an Update Emits is now played right after it, before any Message already waiting, depth first and at the same Time, so one Message and the Emits it set off sit together in the History. `runtime.work()` is the Work report: each Worker waiting, running, finished or failed with its failure, each Command still running, each Provide and the app's Layer building, built or failed, the latest failures, and whether the app is settled.
