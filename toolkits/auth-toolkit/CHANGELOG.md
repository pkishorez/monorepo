# @kestack/auth-toolkit

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
