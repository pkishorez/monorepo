# @kstackz/ui-toolkit

## 0.0.12

### Patch Changes

- [#59](https://github.com/pkishorez/monorepo/pull/59) [`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Moves to stable Effect 4. The `effect` peer is now `^4.0.0`, so any Effect 4 release works, and Effect 4.0.0 is required: it drops the `effect/unstable/*` import paths these packages relied on.

  Other peer changes:

  - The optional `alchemy` peer is now `2.0.0-beta.80`, the first alchemy release that runs on Effect 4.0.0.
  - pwa-toolkit's optional `vite` peer is now `^8.0.0`. It was published as the Vite+ core alias by mistake.
  - std-toolkit's optional `vitest` peer, for `@kstackz/std-toolkit/snapshot/vitest`, is now `^5.0.0`.

- [#56](https://github.com/pkishorez/monorepo/pull/56) [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Initial release under the `@kstackz` scope.

  The shared React UI for kstack apps: shadcn primitives, larger blocks (auth screens, diagrams, trace viewer, architecture explorers), a form hook, and Tailwind styles. It ships source, so your Vite build compiles it with your theme. You need it so each app does not rebuild the same buttons, dialogs, and viewers.

- [#56](https://github.com/pkishorez/monorepo/pull/56) [`1dd5049`](https://github.com/pkishorez/monorepo/commit/1dd5049705d9f722a6fc2486240a2e7cd11bbbe3) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Introducing `@kstackz/use-gesture`: touch gestures for React, with every finger of a touch as motion values, in nested zones that own touch.

  - `@kstackz/use-gesture`: `GestureProvider`, `GestureZone`, and the ready-made `useSidebar` and `usePullToRefresh`.
  - `@kstackz/use-gesture/recognizers`: `useSwipe`, fingers moving one way, with live offset, velocity and whether a release would commit.
  - `@kstackz/use-gesture/core`: `useGesture`, every finger of each touch and nothing else.

  The gestures block moves here from `@kstackz/ui-toolkit`; `@kstackz/ui-toolkit/components/blocks/gestures` is gone.

- [#45](https://github.com/pkishorez/monorepo/pull/45) [`0285248`](https://github.com/pkishorez/monorepo/commit/02852488585c71fd99b8e4defbb9185396f293dd) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Several Signed-in Accounts per browser. The Auth Worker always runs Better Auth's multi-session plugin; `createAuthWorker` takes an optional `multiSession: { maximumAccounts? }` block to change the cap (default 5). Every Auth Worker screen shows an account switcher top-right: the Active Account's email, a `+N` badge for the other Signed-in Accounts, and a menu to switch, add another account, sign out of the active one, or sign out of all. The Login Screen accepts `add_account` to let a signed-in User add another account; the Consent and Device screens act as the Active Account and switch in place. The Device Screen no longer looks up a prefilled code on load; the User confirms the account and presses Continue. A consumer app's `signOut()` signs out every Signed-in Account. ui-toolkit's auth block gains `AccountSwitcher`, an `accounts` prop on each screen, and an `adding` login state; `email-privacy` becomes its own module.

- [#61](https://github.com/pkishorez/monorepo/pull/61) [`a7ca95c`](https://github.com/pkishorez/monorepo/commit/a7ca95c489480f1593c33eac7f9554a65da358c1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - `LocalSignIn` asks who to sign in as when an app's sign-in is local, with one-tap presets and an email and name form.

- [#61](https://github.com/pkishorez/monorepo/pull/61) [`e7e77f7`](https://github.com/pkishorez/monorepo/commit/e7e77f7b1a12ee15ba3e223221019ed1fe130392) Thanks [@kishorenuma](https://github.com/kishorenuma)! - On touch, the app shell's Sidebar covers its first 24px from the screen edge with a plain strip, so a swipe from the edge never lands on a Sidebar item and never goes back a page.
- Updated dependencies [[`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`1dd5049`](https://github.com/pkishorez/monorepo/commit/1dd5049705d9f722a6fc2486240a2e7cd11bbbe3), [`ca6e1d8`](https://github.com/pkishorez/monorepo/commit/ca6e1d8230af130c1747987752b49185c2c3b18b), [`f1ac87b`](https://github.com/pkishorez/monorepo/commit/f1ac87bdce327a8e3d165e3a69b947f454e5bbee), [`ae93dd8`](https://github.com/pkishorez/monorepo/commit/ae93dd8a49e01c4c01e8033736220e704435a2c9), [`a9a0c20`](https://github.com/pkishorez/monorepo/commit/a9a0c20eb05422db2557e2d2012f13f5051dad5c), [`23ad244`](https://github.com/pkishorez/monorepo/commit/23ad244481b2b3d0f1e8afb552143996ae54a217)]:
  - @kstackz/effect-tracer@0.0.12
  - @kstackz/flow@0.0.12
  - laymos@0.0.12
  - use-effect-ts@0.0.12
  - @kstackz/lotel@0.0.12
  - @kstackz/use-gesture@0.0.12
