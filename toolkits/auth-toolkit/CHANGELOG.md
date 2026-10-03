# @kstackz/auth-toolkit

## 0.0.12

### Patch Changes

- [#59](https://github.com/pkishorez/monorepo/pull/59) [`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Moves to stable Effect 4. The `effect` peer is now `^4.0.0`, so any Effect 4 release works, and Effect 4.0.0 is required: it drops the `effect/unstable/*` import paths these packages relied on.

  Other peer changes:

  - The optional `alchemy` peer is now `2.0.0-beta.80`, the first alchemy release that runs on Effect 4.0.0.
  - pwa-toolkit's optional `vite` peer is now `^8.0.0`. It was published as the Vite+ core alias by mistake.
  - std-toolkit's optional `vitest` peer, for `@kstackz/std-toolkit/snapshot/vitest`, is now `^5.0.0`.

- [#56](https://github.com/pkishorez/monorepo/pull/56) [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Initial release under the `@kstackz` scope.

  One Cloudflare Worker owns sign-in, sign-out, and sessions, built on better-auth and D1. It includes React session hooks for web apps, Device Login for CLIs, access tokens for MCP clients, and server-side checks for backends. You need it so every program asks one place "who is this?" instead of each one handling auth itself.

  Subpaths are named for the program that imports them: `worker/*` for the Auth Worker and its Primary Database, `server/*` for a Consumer Backend, and `clients/browser` and `clients/cli` for First-Party programs. `rpc` and `http-api` are the Auth Cannotation declarations both sides share.

- [#45](https://github.com/pkishorez/monorepo/pull/45) [`0285248`](https://github.com/pkishorez/monorepo/commit/02852488585c71fd99b8e4defbb9185396f293dd) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Several Signed-in Accounts per browser. The Auth Worker always runs Better Auth's multi-session plugin; `createAuthWorker` takes an optional `multiSession: { maximumAccounts? }` block to change the cap (default 5). Every Auth Worker screen shows an account switcher top-right: the Active Account's email, a `+N` badge for the other Signed-in Accounts, and a menu to switch, add another account, sign out of the active one, or sign out of all. The Login Screen accepts `add_account` to let a signed-in User add another account; the Consent and Device screens act as the Active Account and switch in place. The Device Screen no longer looks up a prefilled code on load; the User confirms the account and presses Continue. A consumer app's `signOut()` signs out every Signed-in Account. ui-toolkit's auth block gains `AccountSwitcher`, an `accounts` prop on each screen, and an `adding` login state; `email-privacy` becomes its own module.
- Updated dependencies [[`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c)]:
  - @kstackz/rpc-toolkit@0.0.12
