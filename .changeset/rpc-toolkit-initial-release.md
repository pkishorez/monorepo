---
'rpc-toolkit': patch
---

Initial release of `rpc-toolkit`: opinionated abstractions over Effect RPC and Effect HttpApi, starting with Cannotation — a cascading annotation declared on an endpoint or a group that attaches its own middleware. A more specific endpoint's value replaces the group's, an unset endpoint inherits it, and values never merge.

- `rpc/cannotation`: `Cannotation.make<V>()(id, { provides, requires, error, client })` for `Rpc` and `RpcGroup`. The declaration (`with`, `get`) is safe to share between client and server; `layer(impl)` builds the server middleware and `clientLayer(impl)` the client middleware, so no implementation leaks into the other bundle.
- `http/cannotation`: the same shape for `HttpApiEndpoint` and `HttpApiGroup`, plus `security` passthrough for OpenAPI.
