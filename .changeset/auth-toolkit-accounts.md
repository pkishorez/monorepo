---
'@kstackz/auth-toolkit': minor
---

`clients/browser` and its React hooks are replaced by `clients/accounts`: an `Accounts` Effect service for the browser's Signed-in Accounts, with `accountsLive` against the Auth Worker and `accountsMock` over Mock Accounts kept in a StdTable, plus `signedFetch` and `signedFetchLayer`. `server/rpc` and `server/http-api` gain `resolverMock`, which reads the User out of a Mock Token, so an app runs without Google or the Auth Worker. See ADR 0016.
