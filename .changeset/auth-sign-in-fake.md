---
'@kestack/auth-toolkit': patch
---

One Sign-in fake, run as a Fake, and Test Users removed.

**Added**, from `fake`:

- `signIn`, the Sign-in fake as a Fake the Fake World runs (`{ name, actor, controls, serve, kept }`): its Kabuki Actor `SignInFake` holds who is signed in on this browser, and the sign-in waiting to be told who. Its Controls (`SIGN_IN_CONTROLS`): `SignInAs`, `CancelSignIn`. `serve` gives the browser's `Accounts` and the signing of every guarded call, the real client over the fake.
- `browserOver(runtime, { cache, returnTo, maxAccounts })`: the same `serve`, with `browser`'s options.
- `SIGNED_IN_AS`, `FAKE_DOMAIN`, `FAKE_AUTH_WORKER`, `blank`.
- `makeCache` and the `CacheStorage` type from `client/browser`.
- `@kestack/kabuki` is an optional peer dependency, for `fake`.

**Changed**

- `fakeAccounts({ choose, returnTo })` runs over a Sign-in fake of its own. An email outside `kestack.test` now fails the sign-in (`AuthWorkerRejected`) rather than signing nobody in.

**Removed** (breaking)

- Test Users: Test Sign-In and `testUsers` on `authWorker`; `testUsers` on `auth.rpc`, `auth.http`, `authAs` and `verify`; `test` on the Principal and the Account; `signIn({ test })`; `TestSignInRefused`, `TestSignInUnsupported`; the Login Screen's test form and the Test label.
- `fakeChooser` and `fakeAccountsTable`, and `fakeAccounts`'s `storage`: fake Accounts live in the Sign-in fake's Model.
