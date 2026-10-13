---
'@kstackz/rpc-toolkit': patch
---

Breaking: three entry points, `rpc`, `http-api` and `alchemy`, replace the old ones (`rpc/cannotation`, `http/cannotation`, `rpc/invocation`, `rpc/websocket-client`, `rpc/cloudflare/*`). The Cannotation is now Middleware (`Rpc.middleware`, `HttpApi.middleware`). `Rpc` has three Transports, each a client and server pair: `http`, `websocket` and the new `inProcess`, which calls the handlers in the same process.

The websocket server can keep stream state in the Durable Object's SQLite (`Rpc.websocket.streams.sqlite`) instead of the 2 KB socket attachment, closes a socket whose saved state is lost with `RESUME_LOST` so the client resubscribes, and its client `url` may be an Effect run before every connect. `@kstackz/std-toolkit` is now a required peer. Needs Effect `^4.0.0`.
