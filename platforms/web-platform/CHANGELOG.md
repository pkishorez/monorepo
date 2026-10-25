# @kestack/ui-toolkit

## 0.0.4

### Patch Changes

- [#91](https://github.com/pkishorez/monorepo/pull/91) [`2642a80`](https://github.com/pkishorez/monorepo/commit/2642a80efb0ca75b2f2698f739914525de95f98e) Thanks [@kishorenuma](https://github.com/kishorenuma)! - `pnpm dev` signs in with auth-toolkit's Fake everywhere, through the `kestack-fake-auth` export condition, and serves every backend on the site's own origin at `/rpc-<name>`, so one tunnel reaches the whole app; `pnpm dev:real` keeps the Auth Worker. A Fake Account's email must be at `kestack.test`, and `fakeGuard` makes the User from it again. The Web Platform fails any build that carries the Fake, and its `backend` gives a Worker's build the same switch.

- [#91](https://github.com/pkishorez/monorepo/pull/91) [`4482206`](https://github.com/pkishorez/monorepo/commit/4482206b19b068ddff9e11d359f04dbf3ba9882b) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A touch Drawer swipes down by its own Gesture Zone, so a zone inside it keeps its own Swipes, and an owner that cancels the close springs it back. A touch screen is touch until keys are used outside a field, and touch again on the next touch. A Swipe Row closes its gap as it leaves, and says `data-swiping` while a finger moves it. A toast rises and fades in, and fades out quicker.

- [#91](https://github.com/pkishorez/monorepo/pull/91) [`31904d6`](https://github.com/pkishorez/monorepo/commit/31904d63b4510647e678fd7a490a2923f6f43453) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Drawer or Top Dialog opened over another layer draws its backdrop too, so everything under it dims.

- [#91](https://github.com/pkishorez/monorepo/pull/91) [`0ddc5c0`](https://github.com/pkishorez/monorepo/commit/0ddc5c05e096b445591de1d03a443b88085b8063) Thanks [@kishorenuma](https://github.com/kishorenuma)! - `AccountSwitcherList` draws the Account menu as a list for a sheet such as a Drawer, and a bottom Drawer is the page's background, with rounder corners and a soft shadow, instead of a grey sheet.

- [`27c2da4`](https://github.com/pkishorez/monorepo/commit/27c2da45f3ac9e06f92ae89e93c16ae4a6343929) Thanks [@pkishorez](https://github.com/pkishorez)! - Touch: the page never zooms, as an app does not: no pinch, no double tap, and no zoom into a field it focuses, iOS's included. The Drawer's and Top Dialog's lists have taller rows and more room around them, and a `tall` Drawer stands at three quarters of the screen whatever it holds.
- Updated dependencies [[`2642a80`](https://github.com/pkishorez/monorepo/commit/2642a80efb0ca75b2f2698f739914525de95f98e)]:
  - @kestack/auth-toolkit@0.0.4
  - laymos@0.0.15
  - @kestack/kabuki@0.0.3
  - @kestack/use-gesture@0.0.2
  - @kestack/use-keys@0.0.2

## 0.0.3

### Patch Changes

- [#88](https://github.com/pkishorez/monorepo/pull/88) [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The Web Platform is for apps on Kabuki Start, in four modules: `ui`, `pwa`, `recipes` and `app`.

  - Breaking: every import path changes, and the TanStack Start parts are gone.
  - `app`: `app({ name, platform, app })` is every Vite plugin, `document({ theme })` the Document, and `app/alchemy` gives `Site` and `State`.
  - `pwa()` needs only a name. Offline, each page follows its Render Mode, and a page marked `private` or `no-store` is never saved.
  - Touch: `Drawer`, `TopDialog`, `SwipeRow` either way, pull to refresh, no focus ring on touch, and `AppShell`'s `sidebarMode`.
  - Keyboard: `recipes/keyboard` with `KeysStatusBar` and `KeysHelp`; `recipes/account-switcher`; `recipes/devtools`.
  - Inside, the PWA engine is three sides (`vite`, `worker`, `page`) on one `contract`, and the UI kit's helpers sit in `kit` under the `#kit/*` alias; no public subpath changes.

- Updated dependencies [[`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1)]:
  - @kestack/auth-toolkit@0.0.3
  - @kestack/kabuki@0.0.3
  - laymos@0.0.14
  - @kestack/use-gesture@0.0.2
  - @kestack/use-keys@0.0.2

## 0.0.2

### Patch Changes

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`a87e8b7`](https://github.com/pkishorez/monorepo/commit/a87e8b73cf0b6ede5894806cccc374fab4fa9497) Thanks [@pkishorez](https://github.com/pkishorez)! - `DevtoolsDock` takes `scrolls: 'window'` for a site whose page scrolls the window: the page stays in the document's flow, keeping its sticky headers and scroll restoration, and the bottom bar or side panel is fixed over it, with the body padded by its size.

- [`250b3db`](https://github.com/pkishorez/monorepo/commit/250b3db5c5b55b375e4649e632b642089f00c587) Thanks [@pkishorez](https://github.com/pkishorez)! - New `recipes/devtools-dock`: `DevtoolsDock` wraps a page with devtools opened from a fixed corner button or Ctrl+/, laid out full screen, as a resizable bar or side panel, or as a floating window, kept across reloads. A click on the Layout button steps to the next Layout, a right click picks one; phones get only full screen and the bar. The Kabuki Timeline keeps clear of the button, the Sheet is a panel over the Map, and the History's Window is a Base UI select with presets from 1 to 500.

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`cb8daac`](https://github.com/pkishorez/monorepo/commit/cb8daaca0574b1c80bea06da0435ff4cfbe114d1) Thanks [@pkishorez](https://github.com/pkishorez)! - A Child is written as a Worker is: `children: { rows: { actor: Row, each: ({ model }) => model.ids, input: (_, id) => …, props: ({ model }, id) => … } }`. `invoke` and `Actor.many` are gone: a Child is always there, there `while` a test holds, or one per key `each` names, and its `input` and `props` take the parent's data and its key. A `while` Child is new, and comes back as a fresh Instance; a parent's View types it as a Handle or `undefined`. An outlet's `children` now carries everything, so `invoke: outlet.invoke` is dropped and the outlet is spread beside the Actor's own Children.

- [`f2462af`](https://github.com/pkishorez/monorepo/commit/f2462af9b7e78e8a817111cd07a6193a90984560) Thanks [@pkishorez](https://github.com/pkishorez)! - A History can keep a Window: `History.make(actor, { window: 100 })`, `toReact(..., { window: 100 })`, or `history.keep(n)` at any time, even while the app runs. Entries older than the Window Compact into a Restore of the Snapshot right after them; `history.keep(null)` keeps every one again from then on. Saved Histories' ids now rise but may skip, and `history.has(id)` says whether an entry is still there. The Kabuki DevTools Timeline gets a Window field. `toReact` remembers a changed Window in `localStorage` under the app's name, so it outlasts a reload.
- Updated dependencies [[`cb8daac`](https://github.com/pkishorez/monorepo/commit/cb8daaca0574b1c80bea06da0435ff4cfbe114d1), [`78aa972`](https://github.com/pkishorez/monorepo/commit/78aa972696c33baa0f0ad3521bb454c17537ef4c), [`13fa549`](https://github.com/pkishorez/monorepo/commit/13fa54979520c64fa87ac8ae576a5f6bdb4cd4f6), [`bf66a56`](https://github.com/pkishorez/monorepo/commit/bf66a566d0c102e1892766f321c93dad264b3b79), [`f2462af`](https://github.com/pkishorez/monorepo/commit/f2462af9b7e78e8a817111cd07a6193a90984560), [`fd94bc0`](https://github.com/pkishorez/monorepo/commit/fd94bc006a15b5960ea67ade3dfb333b1e7b6fce), [`2ba4537`](https://github.com/pkishorez/monorepo/commit/2ba4537b0ab0f5a22105f62a6c635a6dd64614ef), [`db8d448`](https://github.com/pkishorez/monorepo/commit/db8d448b3f2cef855f704596f2cc5991ced11c14), [`a1037fe`](https://github.com/pkishorez/monorepo/commit/a1037fe03e52badd0eb8d71ac81c87bbf007b5a1), [`ccb8fde`](https://github.com/pkishorez/monorepo/commit/ccb8fde624c92bb445cf422ba2db719a3f0e4965), [`3428d71`](https://github.com/pkishorez/monorepo/commit/3428d71ac531333a1da3ec48d3777cbf6b092636), [`478ff35`](https://github.com/pkishorez/monorepo/commit/478ff35181a31706a333cd1108f3c0030289ef33), [`9eca385`](https://github.com/pkishorez/monorepo/commit/9eca385a8763f5c44acff676345c62d825af9c07), [`7be2c3d`](https://github.com/pkishorez/monorepo/commit/7be2c3dc37fe98789be9c67ec6f36c6b66de67bd)]:
  - @kestack/kabuki@0.0.2
  - @kestack/auth-toolkit@0.0.2
  - @kestack/rpc-toolkit@0.0.2
  - @kestack/std-toolkit@0.0.2
  - laymos@0.0.13
  - @kestack/use-gesture@0.0.1
  - @kestack/use-keys@0.0.1

## 0.0.1

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - First release. The one way to build a kstack app: `createApp` turns one config into a PWA on TanStack Start with its Theme, its APIs on a cloud or a device Backend, several Accounts with one Session each, and the screens before sign-in. `./define` holds what an app writes before `createApp` (`Api.http`, `Api.websocket`, `defineSession`) and loads nothing of the browser. `./server` has `createServer` and `liveObject`, a Durable Object per user for each `websocket` API that serves only the user it was opened for. Underneath are the parts to build screens with: `theme`, `feedback`, `input` (the browser's touch gestures, on `@kestack/use-gesture`), `components`, `form` and `recipes`, including the Kabuki devtools.

  It replaces `@kestack/ui-toolkit` and `@kestack/pwa-toolkit`, which are no longer published; their gestures block is now `./input`. A Gesture ends when its fingers lift, even after the element they landed on has left the page; a touch that finds fewer fingers on the screen than the Gesture under way ends it as Interrupted; and a swipe from a Sidebar's edge always moves the Sidebar and never goes back a page.

- Updated dependencies [[`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9), [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9), [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9), [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9), [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9), [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9), [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9), [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9)]:
  - @kestack/auth-toolkit@0.0.1
  - @kestack/kabuki@0.0.1
  - laymos@0.0.12
  - @kestack/rpc-toolkit@0.0.1
  - @kestack/std-toolkit@0.0.1
  - use-effect-ts@0.0.12
  - @kestack/use-gesture@0.0.1
  - @kestack/use-keys@0.0.1
