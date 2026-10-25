# 22. Test Users sign in at the Auth Worker, and Local mode becomes the fake

Date: 2026-10-24

## Status

Accepted. Extended by [root ADR 0012](../../../../docs/adr/0012-pnpm-dev-signs-in-with-the-fake.md): every app signs in with the Fake under `pnpm dev`, and a Fake Account's email must be at `kestack.test`. Supersedes the Local mode of [ADR 0016](./0016-auth-runs-locally-at-two-seams-joined-by-a-local-token.md) and [ADR 0018](./0018-three-caller-kinds-four-doors.md), and reverses ADR 0016's rejection of Test Login on the real Auth Worker.

## Context

An agent, a browser test or a preview deployment needs to sign in without a Google account, often as several Users at once. Local mode was the only way: `browser({ local })` on the client and `auth({ local: true })` on the backend, where a Local Token names any User and the backend believes it. That fits an app whose whole backend runs in the tab, but not a real deployment: a backend in Local mode lets anyone be anyone, so an agent testing a deployed app had nothing safe to sign in with. And the option sat on the real doors, one setting away from a production backend that admits everyone.

ADR 0016 rejected a Test Login on the Auth Worker because an in-browser backend cannot reach one. That stays true, but it is now a different problem from the one Test Users solve.

## Decision

The Auth Worker has two ways to sign in: Google, and **Test Sign-In**. A **Test User** is a User whose email ends in `.test`, a reserved top-level domain no Google account can have. The email is the only mark: no column, no migration, so removing the feature is deleting the plugin and the option.

- `authWorker({ testUsers: { key?, allow? } })` turns Test Sign-In on; omitted, it does not exist. `key`, when set, must come with every Test Sign-In; it is a Worker secret and never goes in a frontend bundle. `allow` may refuse an email. A non-`.test` email is always refused.
- `admit` is for real users and does not apply to Test Users. Google sign-in can never create a `.test` User.
- Test Sign-In gives a normal better-auth Sign-in and HttpOnly cookie, and joins the Accounts, so Account Switch, sign-out, `expect-user`, Device Login and the Consent Screen work unchanged. The Login Screen offers it next to Google when it is on, and Test Users carry a "Test" label on the Auth Worker's pages.
- Every backend refuses Test Users with Forbidden, whatever their credential (cookie, Device token or Access Token), until its guard opts in: `auth({ url, testUsers: true })`. `Principal.test` and `Account.test` tell them apart; otherwise a Test User is any User.
- `accounts.signIn({ test: { email, key? } })` signs a Test User in from a Browser without leaving the page. A Device fails it with TestSignInUnsupported; a Device reaches a Test User by Device Login, through the Login Screen.

Local mode leaves the real doors. It becomes the **fake**, `@kestack/auth-toolkit/fake`: `fakeAccounts` in place of `browser()`, `fakeChooser`, `fakeAccountsTable`, and `fakeGuard.rpc()` / `fakeGuard.http()` in place of `auth()`. It is auth for the browser environment, where the whole backend runs in the tab, and it lives beside the service it fakes, as any service's fake does. What it stores keeps its format: the `auth-local-accounts` table, the `local.` token prefix and `local_` user ids.

## Considered options

- **A Sandbox stage with Local mode**, a separate deployment of each app whose backend trusts Local Tokens. Rejected: one more deployment per app to keep alive, and it tests a backend that differs from the real one in the one part being tested.
- **A `test` column on the User.** Rejected: it needs a migration, and removing the feature would need another. A `.test` email cannot be confused with a real one, so it carries the same fact for free.
- **Test Users made by any page, without the Auth Worker**, as an unsigned cookie a backend reads. Rejected: anyone could write that cookie, so it is Local mode again on a real backend.
- **The email alone as the secret.** Rejected as the only option: anyone who guesses the naming signs in. The key is optional, so a preview can go without one, and a deployment others can reach sets one.

## Consequences

An agent or a preview signs in against the real Auth Worker and a real backend, as many Users as it likes, and the backend runs the same code it does for real Users. A deployment that turns Test Sign-In on without a key lets anyone create Test Users, and they stay until deleted; nothing limits or cleans them up yet. A backend that forgets `testUsers: true` refuses them, so the safe mistake is the likely one. `browser({ local })` and `auth({ local: true })` now throw, naming the fake, so an app still on Local mode is told where it went. No app uses Test Users yet.
