---
'rpc-toolkit': patch
---

Initial release of `rpc-toolkit`: opinionated abstractions over Effect RPC and Effect HttpApi, including Cannotations, WebSocket clients, and Cloudflare runtime and deployment integrations. A Cannotation is a cascading annotation declared on an endpoint or a group that attaches its own middleware. A more specific endpoint's value replaces the group's, an unset endpoint inherits it, and values never merge.

- `rpc/cannotation`: `Cannotation.make<V>()(id, { provides, requires, error, client })` for `Rpc` and `RpcGroup`. The declaration (`with`, `get`) is safe to share between client and server; `layer(impl)` builds the server middleware and `clientLayer(impl)` the client middleware, so no implementation leaks into the other bundle.
- `http/cannotation`: the same shape for `HttpApiEndpoint` and `HttpApiGroup`, plus `security` passthrough for OpenAPI.
- `rpc/invocation`: server-controlled `InvocationKind` distinguishes fresh calls from hibernation replay, so admission middleware can avoid charging again while authorization still checks current permission.
- `rpc/websocket-client`: WebSocket transport, reactive connection status, URL resolution, and `keepSubscribed` for restarting subscriptions after reconnect. Restarted subscriptions are fresh calls and run client middleware again.
- `rpc/cloudflare/hibernating-rpc`: Durable Object WebSocket callbacks, connection attachments, and `StreamCheckpoint` for resuming streams after hibernation. Replay passes through server middleware again.
- `rpc/cloudflare/alchemy/rpc-worker` and `rpc/cloudflare/alchemy/durable-rpc-worker`: `RpcWorker` and `DurableRpcWorker` deployment helpers for Effect RPC Workers and Durable Objects. Alchemy is an optional peer required only by these deployment entry points.

Consolidates the RPC integrations previously housed in `effect-cloudflare` and `alchemy-toolkit` under `rpc-toolkit`; consumers must update their imports to the new entry points. Includes migration guidance and a complete WebSocket client/server example.
