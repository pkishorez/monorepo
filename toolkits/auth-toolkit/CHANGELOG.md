# @kestack/auth-toolkit

## 0.0.7

### Patch Changes

- [#128](https://github.com/pkishorez/monorepo/pull/128) [`eba4397`](https://github.com/pkishorez/monorepo/commit/eba4397640c4ab3e921bb0c7613e24b25b89ca6a) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Browser app can say where a sign-in comes back to, and read the Accounts its cache remembers.

  **Added**

  - `browser({ returnTo })`: where a sign-in that names no `returnTo` comes back to, as an absolute URL. Unless given, it is the page the sign-in left from, as before. An app whose pages are each one Account's can send an Account added from its Account Switcher to a page that is not the old Account's.
  - `rememberedAccounts`, from `client/browser`: the Accounts the `cache` remembers as last signed in, without tokens, in sign-in order; none when it remembers none or cannot be read. Provide it the same Layer of `browserAccountsTable` given as `cache`.

- [#128](https://github.com/pkishorez/monorepo/pull/128) [`eba4397`](https://github.com/pkishorez/monorepo/commit/eba4397640c4ab3e921bb0c7613e24b25b89ca6a) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Google's own sign-in button is one component, at the new `@kestack/auth-toolkit/google-button` door, and the Auth Worker's Login Screen and Device Screen draw it.

  **Added**

  - `GoogleButton` (`@kestack/auth-toolkit/google-button`): the GSI material button as Google's branding guidelines draw it, with only Google's words ("Sign in with Google", "Continue with Google", "Sign up with Google") and a `light`, `dark` or `auto` theme; `auto` is dark under `.dark` or `data-theme="dark"`. It brings Google Sans Medium, the guidelines' font, from `@fontsource/google-sans` (its Latin file, 23 KB), declared in the button's own style, so a browser fetches it only on a page that draws the button, and uses one installed on the computer first. The app's bundler ships the file, imported `?url`. It sets no margin or width: place it with `className`.

  **Changed**

  - The Login Screen and the Device Screen draw that button in place of their own, 40px tall as Google's is. It says only Google's words: where it said "Sign in as {email}", it says "Sign in with Google" and the line above it names the account. It has no spinner: while the page leaves for Google it disables, and "Opening Google…" shows under it.

- [#128](https://github.com/pkishorez/monorepo/pull/128) [`eba4397`](https://github.com/pkishorez/monorepo/commit/eba4397640c4ab3e921bb0c7613e24b25b89ca6a) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Browser app can sign in with Google from its own screen, and the Fake comes back where a sign-in asks.

  **Added**

  - `signIn({ provider: 'google', returnTo })` on `browser()`: asks the Auth Worker where Google is, as its Login Screen's button does, and leaves for it at once, without the Login Screen. The sign-in comes back to `returnTo` (else `browser({ returnTo })`, else the page it left from); one that fails lands on the Login Screen, which says why, adding an Account when one was signed in already. The Auth Worker needs no change: it trusts every origin under its `cookieDomain`.
  - `browser({ maxAccounts })`, 5 unless given: a `provider` sign-in with that many Accounts signed in fails `AccountLimitReached`, as the Login Screen refuses one.
  - `fakeAccounts({ returnTo })`, and the Fake `browser({ returnTo })`: once someone is chosen, a sign-in whose `returnTo` (its own, else this one) is another page leaves for it with `window.location.assign`, as the real one would; on the same page it signs in in place, as before. A Test User (`test`) always signs in in place. The Fake asks who for a `provider` sign-in as for any other.

- Updated dependencies [[`6cf1d7f`](https://github.com/pkishorez/monorepo/commit/6cf1d7fb87f1b98311e1d6ab9b86b8f233e0c707)]:
  - @kestack/std-toolkit@0.0.7
  - @kestack/rpc-toolkit@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies [[`30b99d1`](https://github.com/pkishorez/monorepo/commit/30b99d1a28c00bb614a0a5180d05cb4355720eed)]:
  - @kestack/std-toolkit@0.0.6
  - @kestack/rpc-toolkit@0.0.6

## 0.0.5

### Patch Changes

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`278b105`](https://github.com/pkishorez/monorepo/commit/278b1054fcc9b53036a7df5b44fe90c21dbde480) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Every Plugin runs at a Release Cloud Connect names, and Code calls it at the Release it was built with.

  **Breaking:** ke-connect, Cloud Connect and Code must update together; nothing reads data from earlier releases. Update with `npm i -g @kestack/connect@latest`, and delete an old `code.db`.

  - Each Plugin is served only at `/<plugin>/<sha256>/rpc`; another Release gets close code 4409, `PLUGIN_MISMATCH`.
  - A Connection older than the Minimum Connect stops and says how to update. It starts its Plugins at the last wanted Releases while Cloud Connect is down.
  - A Connection that signed in before starts while Cloud Connect is down.
  - Cloud Connect has its own export, `@kestack/connect/cloud`; those names left `@kestack/connect/code`.
  - `pnpm release:plugin` builds a Plugin and adds it to its Release Log.
  - `@kestack/cli-platform`: `Downloads.fetch` takes `file:` URLs. A new Plugin process starts only after the old one exits. Of many `single` claims at once, exactly one wins.
  - `@kestack/auth-toolkit`: a Device's `url` may be an Effect, so it follows an Auth Worker that moves.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`139011f`](https://github.com/pkishorez/monorepo/commit/139011fe37d4cb1960fb30091f42308cf56e0dd2) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Two `ke-connect serve` of one Connection at once: only one signs in; the other says it is already running. A Device sign-in gives up as soon as its Auth Worker moves.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`0bed3f8`](https://github.com/pkishorez/monorepo/commit/0bed3f83e9701bcb850c94f4d7864445a5f9108d) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A signed-in reload opens straight from what this device kept, with no flash of loading screens. Switching Account draws the next one in one step.

  `browser`'s `cache` remembers the last Accounts, so `state` starts `Checking { last }`. A cache that can't be read or written logs a warning.

- Updated dependencies [[`8b4ff10`](https://github.com/pkishorez/monorepo/commit/8b4ff102bf78eb9bf94125e59b9657baafe0f19e), [`6a64461`](https://github.com/pkishorez/monorepo/commit/6a6446178baa61df7df5cc1b8272ae56e38c962c)]:
  - @kestack/std-toolkit@0.0.5
  - @kestack/rpc-toolkit@0.0.5

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
