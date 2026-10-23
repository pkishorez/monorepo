---
'@kestack/std-toolkit': patch
---

Replica knows what has never synced on this device. A Strategy's first answer now saves its cursor even when it holds nothing, so the Store remembers that a Collection, or a Window of one, has synced once; one it holds no cursor for is Never Synced. A Query's Model gains `neverSynced`, the names of the Instances holding something it reads that is Never Synced, kept up to date as each first syncs. After a reload, or while a Gate is shut, an Instance not named there shows what it last synced, an empty list included, without waiting to be Caught Up, so a view draws a skeleton only for what this device has never had.
