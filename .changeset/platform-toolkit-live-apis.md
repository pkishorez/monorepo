---
'@kstackz/platform-toolkit': patch
---

A Host's Storage gives a Broadcaster for each of its databases (`storage.broadcaster(database)`; `keptBroadcasters` makes one per database for the life of the app), so a device Backend's handlers are heard by every tab. A WebSocket API opens with the Account's token in its address, fresh at every connect, as a browser sets no headers on a WebSocket. A Session's stream ends when its WebSocket drops, so Std Sync opens it again from where it has got to instead of waiting on a stream the server forgot.
