# Replay rechecks authorization without counting a new admission

> Names changed in [ADR 0005](../../../../docs/adr/0005-three-toolkits-three-doors.md): Cannotation is now Middleware (`Rpc.middleware`, `HttpApi.middleware`, `clientLayer` is `client`), and the package has three doors, `rpc`, `http-api` and `alchemy`.

Hibernation Replay passes through server Cannotation middleware again so its authorization implementation can check current permission; a rejected call terminates with its declared RPC error. Persisted Connection Identity identifies the caller but does not establish current authorization, and replay retains the original request headers rather than obtaining fresh client credentials.

Expose a server-controlled distinction between a fresh call and Hibernation Replay so admission rate limits count fresh calls by default without charging again for restoration. A Subscription Restart after reconnect is a fresh call. Skipping all middleware on replay was rejected because it would bypass authorization; counting every replay as a new admission was rejected because server lifecycle events should not spend the caller's admission allowance.

The platform-independent `rpc/invocation` module exposes an Effect context reference with values `fresh | replay`, defaulting to `fresh`. The hibernating runtime provides `replay` while dispatching restored requests; middleware consumes the reference without importing Cloudflare or changing Cannotation's signatures. This signal is supplied by the server, never accepted from client headers or payloads.

Authorization is checked on initial dispatch and replay. Continuous revocation during an uninterrupted stream remains application policy; this migration does not introduce a subscription revocation system. Permission changes may therefore remain unapplied until another dispatch unless the application explicitly terminates the stream.
