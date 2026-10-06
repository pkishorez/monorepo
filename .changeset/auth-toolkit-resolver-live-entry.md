---
'@kstackz/auth-toolkit': patch
---

`resolverLive` moves to its own entry, `@kstackz/auth-toolkit/server/resolver-live`; `server/rpc` and `server/http-api` no longer export it. It is the only part of Current Auth that brings better-auth's server code, so a backend that runs on a device with `resolverLocal` (as Ledger's Local Backend does in React Native, where Metro bundles every import) and the browser-safe `rpc` and `http-api` Declarations no longer load it. Import `resolverLive` from the new entry.
