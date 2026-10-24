---
'@kestack/std-toolkit': patch
---

`IDB.prune({ prefix, keep })` deletes every IndexedDB database under a prefix whose next `:` segment is not kept, and answers their names; an empty prefix is refused. The Replica Store gains `prune`: `store.prune([[Ai, machineIds]])` keeps exactly those Instances and removes every other one, stopping it in every tab first, so a Replica renamed or a Key gone is deleted without being named. `Store.idb({ prefix })` names its databases, Web Locks and Doorbell topics under a prefix, `replica:` unless given, so one Store per Account never meets another. Breaking: `retired` is gone from `Store.idb`, and `Store.memory` takes no options; use `prune`.
