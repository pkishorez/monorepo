# @kestack/auth-toolkit

## 0.0.4

### Patch Changes

- [#91](https://github.com/pkishorez/monorepo/pull/91) [`2642a80`](https://github.com/pkishorez/monorepo/commit/2642a80efb0ca75b2f2698f739914525de95f98e) Thanks [@kishorenuma](https://github.com/kishorenuma)! - `pnpm dev` signs in with auth-toolkit's Fake everywhere, through the `kestack-fake-auth` export condition, and serves every backend on the site's own origin at `/rpc-<name>`, so one tunnel reaches the whole app; `pnpm dev:real` keeps the Auth Worker. A Fake Account's email must be at `kestack.test`, and `fakeGuard` makes the User from it again. The Web Platform fails any build that carries the Fake, and its `backend` gives a Worker's build the same switch.
- Updated dependencies []:
  - @kestack/rpc-toolkit@0.0.4
  - @kestack/std-toolkit@0.0.4

## 0.0.3

### Patch Changes

- [#88](https://github.com/pkishorez/monorepo/pull/88) [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - auth-toolkit is rebuilt around three Caller Kinds (Browser, Device, OAuth).

  - Breaking: one `server` door with `auth.rpc({ url })` and `auth.http({ url })`; Local mode is gone, replaced by the `fake` door (`fakeAccounts`, `fakeGuard`).
  - Test Users (emails ending in `.test`) sign in without Google, once a guard allows them with `testUsers: true`.
  - `AccountsState.SignedIn` says `switchingTo` during an Account Switch.
  - better-auth 1.7.12: a migration drops `account.issuer`.

- Updated dependencies [[`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1)]:
  - @kestack/rpc-toolkit@0.0.3
  - @kestack/std-toolkit@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @kestack/rpc-toolkit@0.0.2
  - @kestack/std-toolkit@0.0.2

## 0.0.1

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - Breaking: the entry points are cut by who imports them.

  - `worker`, `worker/memory`, `worker/alchemy`: the Auth Worker and its database. `alchemy/d1`, `database/d1` and `database/memory` are gone.
  - `guard`: `Authz`, the contract both sides share. Replaces `rpc`, `rpc/server`, `http-api` and `http-api/server`.
  - `server` and `server/cloud`: checking calls on a Backend, with a `device` Resolver that reads a Name Token and a `cloud` one that asks the Auth Worker. `server/access-token` and `server/mcp` are gone.
  - `client`, `client/web`, `client/cli`: signing in. `cli` is now `client/cli`.
  - Running sign-in in a web app (the Gate, each Account's Session, `createApp`) is `@kestack/web-platform`'s.

  New: several Signed-in Accounts per browser, with an account switcher on every Auth Worker screen and `multiSession: { maximumAccounts }` on `createAuthWorker` (default 5). Signing in by name works on a device Backend without Google or the Auth Worker. Needs Effect `^4.0.0`; the `react` peer accepts any React 19.

- Updated dependencies [[`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9), [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9)]:
  - @kestack/rpc-toolkit@0.0.1
  - @kestack/std-toolkit@0.0.1
