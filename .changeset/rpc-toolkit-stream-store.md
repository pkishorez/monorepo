---
'@kstackz/rpc-toolkit': patch
---

The websocket server can keep stream state somewhere other than the socket attachment. Pass `streams` to `Rpc.websocket.server` (or `DurableRpcWorker`) to choose a Stream Store. The default, `Rpc.websocket.streams.attachment()`, works as before. The new `Rpc.websocket.streams.sqlite({ storage })` keeps each socket's record and each open stream's request and checkpoint as rows in the Durable Object's own SQLite, so a few streams carrying a token no longer overflow the 2 KB attachment. It creates its table on first use and hard-deletes rows when a stream ends, when a socket closes, and on boot for sockets that are gone. `@kstackz/std-toolkit` is now a peer dependency.

A live socket whose saved record is missing (or whose attachment cannot be read) is now closed with code 4000, `Rpc.websocket.RESUME_LOST`, so the client reconnects and resubscribes, instead of carrying on with empty state.

`Rpc.websocket.checkpoint` no longer dies outside a WebSocket-server stream: on in-process or http Transports it remembers nothing, so the same streaming handler runs everywhere.

`Rpc.websocket.client`'s `url` may be an Effect, run again before every connect, so a reconnect can carry what changed since, such as a fresh token.
