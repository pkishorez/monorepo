---
'@kestack/rpc-toolkit': patch
---

- Breaking: each Transport is its own door (`rpc/http`, `rpc/websocket`, `rpc/in-process`, `http-api`); the `Rpc` and `HttpApi` namespaces are gone.
- `onExit` lets a Client Implementation see how a call ended.
- The websocket `client` takes `protocols`.
