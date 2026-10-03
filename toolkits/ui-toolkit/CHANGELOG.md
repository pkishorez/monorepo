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
- Updated dependencies [[`a1cb02d`](https://github.com/pkishorez/monorepo/commit/a1cb02d062c76b0b5ae57f04b37746276f6426f1), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`61d6861`](https://github.com/pkishorez/monorepo/commit/61d686171019c76b5f2fb350860697388e59513c), [`1dd5049`](https://github.com/pkishorez/monorepo/commit/1dd5049705d9f722a6fc2486240a2e7cd11bbbe3), [`ca6e1d8`](https://github.com/pkishorez/monorepo/commit/ca6e1d8230af130c1747987752b49185c2c3b18b), [`f1ac87b`](https://github.com/pkishorez/monorepo/commit/f1ac87bdce327a8e3d165e3a69b947f454e5bbee)]:
  - @kstackz/effect-tracer@0.0.12
  - @kstackz/flow@0.0.12
  - laymos@0.0.12
  - use-effect-ts@0.0.12
  - @kstackz/lotel@0.0.12
  - @kstackz/use-gesture@0.0.12
