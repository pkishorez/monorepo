---
'@kestack/auth-toolkit': patch
'@kestack/web-platform': patch
'@kestack/ai-toolkit': patch
---

The Auth Worker can sign in Test Users without Google. A Test User is any User whose email ends in `.test`; `authWorker({ testUsers: { key?, allow? } })` turns Test Sign-In on, and the Login Screen offers it beside Google. It is a normal Sign-in, so switching, sign-out, Device Login and consent work unchanged. `admit` does not apply to Test Users, and Google can never create one. Every backend refuses Test Users with Forbidden until its guard says `auth.rpc({ url, testUsers: true })` (or `auth.http`). `Principal.test` and `Account.test` tell them apart. A Browser signs one in with `accounts.signIn({ test: { email, key? } })`, which fails `TestSignInRefused` when the Auth Worker says no; a Device fails it with `TestSignInUnsupported`.

Breaking: Local mode is gone from the real doors. `browser({ local })` and `auth({ local: true })` are gone, and `localChooser` and `localAccountsTable` are removed. The new `fake` door replaces them: `fakeAccounts`, `fakeChooser`, `fakeAccountsTable` and `fakeGuard.rpc()` / `fakeGuard.http()`. Stored Fake Accounts and tokens keep their format.

web-platform's Local Backend and `memoryHost` now run on the fake; its own options are unchanged. ai-toolkit's Machines Backend uses `fakeGuard` for `auth: { local: true }`, which it keeps.
