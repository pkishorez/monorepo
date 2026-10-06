# @kstackz/auth-toolkit

## 0.0.12

### Patch Changes

- [#62](https://github.com/pkishorez/monorepo/pull/62) [`ec876c4`](https://github.com/pkishorez/monorepo/commit/ec876c4db61ef4113c29ad314670d842b4694497) Thanks [@kishorenuma](https://github.com/kishorenuma)! - `clients/browser` and its React hooks are replaced by `clients/auth`: an `Auth` Effect service for the browser's Signed-in Accounts, with `authLive` against the Auth Worker and `authLocal` over Local Accounts kept in a StdTable, plus `signedFetch` and `signedFetchLayer`. `Authz.bearer` signs each guarded RPC call as one Session over any Protocol. `server/rpc` and `server/http-api` gain `resolverLocal`, which reads the User out of a Local Token, so an app runs without Google or the Auth Worker. See ADR 0016.

- [#61](https://github.com/pkishorez/monorepo/pull/61) [`ae5b3f9`](https://github.com/pkishorez/monorepo/commit/ae5b3f9f9862773a50b54c7d61d1beed2d6ed789) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The browser client gains `signOutAccount(token)`, which signs out one Signed-in Account, active or not, and leaves the others signed in. See ADR 0015.

- [#61](https://github.com/pkishorez/monorepo/pull/61) [`dab85c4`](https://github.com/pkishorez/monorepo/commit/dab85c48ad6789022b5d95690cf853f062eee640) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The browser client gains `signedInAccounts()`, which lists every Signed-in Account of the browser with its Session token and the Active Account marked, and `switchAccount(token)`, which makes one the Active Account for every tab. A First-Party app may send a listed token as `Authorization: Bearer` to its own Consumer Backend to act as that account whichever is active; Server-Side Verification already resolves a bearer before the cookie. See ADR 0014.

- [#59](https://github.com/pkishorez/monorepo/pull/59) [`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Moves to stable Effect 4. The `effect` peer is now `^4.0.0`, so any Effect 4 release works, and Effect 4.0.0 is required: it drops the `effect/unstable/*` import paths these packages relied on.

  Other peer changes:

  - The optional `alchemy` peer is now `2.0.0-beta.80`, the first alchemy release that runs on Effect 4.0.0.
  - pwa-toolkit's optional `vite` peer is now `^8.0.0`. It was published as the Vite+ core alias by mistake.
  - std-toolkit's optional `vitest` peer, for `@kstackz/std-toolkit/snapshot/vitest`, is now `^5.0.0`.

- [#56](https://github.com/pkishorez/monorepo/pull/56) [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Initial release under the `@kstackz` scope.

  One Cloudflare Worker owns sign-in, sign-out, and sessions, built on better-auth and D1. It includes React session hooks for web apps, Device Login for CLIs, access tokens for MCP clients, and server-side checks for backends. You need it so every program asks one place "who is this?" instead of each one handling auth itself.

  Subpaths are named for the program that imports them: `worker/*` for the Auth Worker and its Primary Database, `server/*` for a Consumer Backend, and `clients/browser` and `clients/cli` for First-Party programs. `rpc` and `http-api` are the Auth Cannotation declarations both sides share.

- [#45](https://github.com/pkishorez/monorepo/pull/45) [`0285248`](https://github.com/pkishorez/monorepo/commit/02852488585c71fd99b8e4defbb9185396f293dd) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Several Signed-in Accounts per browser. The Auth Worker always runs Better Auth's multi-session plugin; `createAuthWorker` takes an optional `multiSession: { maximumAccounts? }` block to change the cap (default 5). Every Auth Worker screen shows an account switcher top-right: the Active Account's email, a `+N` badge for the other Signed-in Accounts, and a menu to switch, add another account, sign out of the active one, or sign out of all. The Login Screen accepts `add_account` to let a signed-in User add another account; the Consent and Device screens act as the Active Account and switch in place. The Device Screen no longer looks up a prefilled code on load; the User confirms the account and presses Continue. A consumer app's `signOut()` signs out every Signed-in Account. ui-toolkit's auth block gains `AccountSwitcher`, an `accounts` prop on each screen, and an `adding` login state; `email-privacy` becomes its own module.
- Updated dependencies [[`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`a7ca95c`](https://github.com/pkishorez/monorepo/commit/a7ca95c489480f1593c33eac7f9554a65da358c1), [`63ff114`](https://github.com/pkishorez/monorepo/commit/63ff114e32f517d4f58873b6ea4809a137744eb6)]:
  - @kstackz/rpc-toolkit@0.0.12
  - @kstackz/std-toolkit@0.0.12
