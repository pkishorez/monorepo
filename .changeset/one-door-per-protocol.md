---
'@kestack/rpc-toolkit': patch
'@kestack/auth-toolkit': patch
'@kestack/web-platform': patch
---

rpc-toolkit: each Transport is its own door, with plain named exports, so an app that uses one ships none of the others. The `Rpc` and `HttpApi` namespaces are gone. `@kestack/rpc-toolkit/rpc` exports `middleware` and `onExit`; `rpc/http` exports `client` and `server`; `rpc/websocket` exports `client`, `server`, `connection`, `status`, `keepSubscribed`, `checkpoint`, `RESUME_LOST`, `fromDurableObjectState`, `InvocationKind`, `attachmentStreamStore` and `sqliteStreamStore`; `rpc/in-process` exports `client`; `http-api` exports `middleware`. Breaking: `Rpc.http.client` is `client` from `rpc/http`, and so on; `Rpc.websocket.streams.attachment()` and `.sqlite()` are `attachmentStreamStore()` and `sqliteStreamStore()`.

auth-toolkit: the root's `Auth` is renamed `Authz`, the same for Effect RPC and Effect HttpApi: `Authz.required`, `Authz.scope`, `Authz.policy`, `Authz.User`, and the errors `Authz.Unauthenticated`, `Authz.Forbidden`, `Authz.Unavailable` and `Authz.AccountChanged`, now usable as types too. `Authz.scope(...)` and `Authz.policy(...)` are still also Effects. Breaking: `Auth.required` is `Authz.required`, and so on. `browser()` and `device()` still sign every guarded call on both protocols.

web-platform imports rpc-toolkit's new Transport doors and auth-toolkit's `Authz`.
