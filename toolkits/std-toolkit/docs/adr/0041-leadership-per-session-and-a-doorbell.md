---
status: accepted
---

# Leadership per Session, and a Doorbell instead of Peer Sync

Every Session (Global Sync or one Partition Sync) has its own Leadership, so
only one tab holds each poll loop or live connection. One lock for the whole Std Sync would fail: a Partition
open only in a follower tab would have no leader. The leader stores Entities in
the shared Sync Store and rings the Doorbell; every Collection listens and
re-reads what changed from the Sync Store. Peer Sync, which relayed complete
Entities between tabs, and its Peer Messages are removed: with a shared store
the store is already the relay.

A Session is one module that knows nothing about Collections or tabs: it waits
for Leadership, runs the strategy, and stores what it yields. Refreshing from other
tabs belongs to the Collection.

A Platform is three pieces: Sync Store, Leadership, Doorbell. The Memory
Platform (the default) shares nothing, so it has no Leadership and no Doorbell.
The browser Platform brings IndexedDB, Web Locks, and BroadcastChannel, each
configurable and each falling back to none where the browser lacks it. No
Platform piece touches a browser global from the main entry, so the core runs
in Node and React Native.

Supersedes ADR-0001. Amends ADR-0002 (Leadership is per Session and on by
default in the browser Platform) and ADR-0004 (Doorbell replaces Peer Sync).
