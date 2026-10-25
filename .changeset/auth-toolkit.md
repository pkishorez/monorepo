---
'@kestack/auth-toolkit': patch
---

auth-toolkit is rebuilt around three Caller Kinds (Browser, Device, OAuth).

- Breaking: one `server` door with `auth.rpc({ url })` and `auth.http({ url })`; Local mode is gone, replaced by the `fake` door (`fakeAccounts`, `fakeGuard`).
- Test Users (emails ending in `.test`) sign in without Google, once a guard allows them with `testUsers: true`.
- `AccountsState.SignedIn` says `switchingTo` during an Account Switch.
- better-auth 1.7.12: a migration drops `account.issuer`.
