---
'@kestack/std-toolkit': patch
---

A Replica Store can prune the Windows an app no longer keeps.

**Added**

- `Store.pruneWindows(replica, key, keep)` keeps the Windows named, per Collection and by the field each opens on, and deletes every other Window's cursor, then its records, one at a time. A Window a participant holds is passed over: each tab holds the Windows it has open, and the Leader each it syncs, by a Web Lock in IndexedDB and a lock in memory. A Window pruned is Never Synced, so it syncs whole when it opens again. It answers the Windows deleted, as `messages/sessionId="s1"`. Where there are no Web Locks, nothing is pruned.
- An Instance has `caughtUp(collection)`: whether that Collection's whole Strategy is Caught Up here, now and on each change, for a Worker that acts only on a real answer.

**Changed**

- Each stored record names the Window it is in, indexed, so one Window's records are found without reading the rest. A record is in a Window only when its Collection syncs by the Windows of one field alone; a Collection that also syncs whole keeps every record. Records kept before this are reindexed in IndexedDB as having no Window named, and named by their Instance the next time it opens.
- Each Collection keeps a generation, raised by a Window Prune; every participant that sees it raised reads the Collection afresh, and its Collections let go of what went.
