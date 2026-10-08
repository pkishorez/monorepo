---
'@kstackz/std-toolkit': patch
---

`sharedBroadcaster(name)` is a Broadcaster shared by every participant of this origin under one name, such as every tab writing to one IndexedDB database: each write is heard where it was made and, through a BroadcastChannel, everywhere else. A subscription in one tab now hears a write a handler made in another.
