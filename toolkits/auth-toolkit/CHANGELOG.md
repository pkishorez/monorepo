# @kestack/auth-toolkit

## 0.0.3

### Patch Changes

- [#71](https://github.com/pkishorez/monorepo/pull/71) [`cfa827b`](https://github.com/pkishorez/monorepo/commit/cfa827be0e6d7d2bfcaac40170d672dbc38eaf38) Thanks [@kishorenuma](https://github.com/kishorenuma)! - auth-toolkit is rebuilt around three Caller Kinds (Browser, Device, OAuth) and four doors. The root exports one `Auth` guard for RPC and HttpApi; `server/rpc` and `server/http` each take one `auth({ url })`; `client/browser` and `client/device` each give one Layer for the `Accounts` service; `worker` exports `authWorker`, configured by `cookieDomain`, `brand` and an `oauth` resources map. Browser apps never hold tokens and send `expect-user`, so a switch in another tab fails Account Changed instead of acting as the wrong User. The Device and Consent Screens approve as a chosen Account without switching, and the Auth Worker's pages are a new Kabuki app whose pages arrive with their data, read by Loaders inside the worker. Their header has a light/dark Theme toggle, following the system until pressed. Breaking: `guard`, `server`, `server/cloud`, `client/web` and `client/cli` are gone, as are `Authz`, `SignIn`, `DeviceCode`, `trustedOrigins` and Test Sign-In.

  web-platform's Gate now runs on `Accounts` (XState removed), its Device Backend is the Local Backend, and its server takes `auth: { url, oauth? }`. effect-webrtc takes `cookieDomain` instead of `trustedOrigins`. kabuki's page types no longer ask a parent for what it provides to its child pages.

- Updated dependencies [[`cfa827b`](https://github.com/pkishorez/monorepo/commit/cfa827be0e6d7d2bfcaac40170d672dbc38eaf38)]:
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
