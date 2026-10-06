---
'@kstackz/auth-toolkit': minor
---

`clients/browser` and its React hooks are replaced by `clients/auth`: an `Auth` Effect service for the browser's Signed-in Accounts, with `authLive` against the Auth Worker and `authLocal` over Local Accounts kept in a StdTable, plus `signedFetch` and `signedFetchLayer`. `Authz.bearer` signs each guarded RPC call as one Session over any Protocol. `server/rpc` and `server/http-api` gain `resolverLocal`, which reads the User out of a Local Token, so an app runs without Google or the Auth Worker. See ADR 0016.
