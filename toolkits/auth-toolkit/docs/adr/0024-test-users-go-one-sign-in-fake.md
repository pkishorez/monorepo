# 24. Test Users go; one Sign-in fake, run as a Fake

Date: 2026-11-22

## Status

Accepted. Supersedes the Test Users of [ADR 0022](./0022-test-users-at-the-auth-worker-local-mode-becomes-the-fake.md); its fake stays, reshaped.

## Context

Test Users gave an agent or a preview a way to sign in at a real Auth Worker without Google. Nothing used them: agents and previews run Code in fake mode, the whole app in a browser tab with nothing behind it, where no Auth Worker can be reached. They still cost a second sign-in route on the Auth Worker, a refusal on every guard (`testUsers`), a `test` mark on every Principal and Account, a form and a label on the pages, and two errors.

Fake mode also needs more of the fake than a dialog that asks for an email: a person driving the app from the fake bubble must answer a sign-in, cancel it, make it fail, act from another tab, and take the Auth Worker away and back.

## Decision

- **Test Users are removed**: Test Sign-In, `testUsers` on `authWorker`, `auth.rpc`, `auth.http`, `authAs` and `verify`, `test` on the Principal and the Account, `signIn({ test })`, `TestSignInRefused`, `TestSignInUnsupported`, the Login Screen's form and the Test label. Real sign-in is unchanged.
- **One Sign-in fake**, `signIn` from the `fake` door: a Fake as the Fake World runs one (`{ name, actor, controls, serve, kept }`). Its Kabuki Actor is the Auth Worker and the provider as one browser sees them: who is signed in, the sign-in waiting to be told who, how the Auth Worker answers. `serve` runs the real Accounts client (the engine, its cache, its signing) over it; `browserOver(runtime, { cache, returnTo, maxAccounts })` does the same with `browser`'s options.
- A sign-in is a `SignInAsked` in the Model until a Control answers it, so the bubble shows it and answers it. Controls: sign in as, cancel, fail the next sign-in, sign out, switch or add an Account from another tab, the Auth Worker slow, out of reach, back.
- The `kestack-fake-auth` export condition and its doors go ([root ADR 0015](../../../../docs/adr/0015-two-modes-real-and-fake.md)): `server`, `client/browser` and `client/device` are always real, and an app picks the Sign-in fake itself, in fake mode only. `FAKE_MARK` is `kestack-fake`, the mark every fake carries.
- `fakeAccounts({ choose })` stays for tests, over a Sign-in fake of its own that `choose` answers. `fakeChooser` and `fakeAccountsTable` go: the Model is where fake Accounts live, and the Fake World keeps it across a reload.

## Consequences

- A guard admits whoever its Resolver names; there is no second class of User to refuse.
- Fake Accounts no longer live in their own IndexedDB table: a reload keeps them through the Fake World's saved Snapshot, and Start fresh clears them with the rest of the world.
