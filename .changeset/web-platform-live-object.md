---
'@kstackz/web-platform': patch
---

`liveObject` from `./server` makes a Live Object: a Durable Object class serving one WebSocket API to one user, its storage theirs alone, with every call still checked by its token. `createServer` takes `live`, the Live Objects of each `websocket` API, and opens each socket at the object named for whoever its token names (401 without one, 503 when the sign-in service cannot be asked); `backend` is now optional. The browser's Storage gives every tab one Broadcaster per database.
