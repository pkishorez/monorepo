# @kestack/ui-toolkit

## 0.0.3

### Patch Changes

- [#69](https://github.com/pkishorez/monorepo/pull/69) [`cc56f42`](https://github.com/pkishorez/monorepo/commit/cc56f42da8b843480b231c7a6c75581bc3c09180) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The Kabuki devtools name who Sent a Message from outside the app, as code reaching it with `running.instance({ from })` named itself, and the Window picker takes 0.

- [#71](https://github.com/pkishorez/monorepo/pull/71) [`cfa827b`](https://github.com/pkishorez/monorepo/commit/cfa827be0e6d7d2bfcaac40170d672dbc38eaf38) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The Kabuki devtools' Map has a button under its zoom controls to lay it out as a packed tree or an outline; `layout` is now only how it starts.

- [#71](https://github.com/pkishorez/monorepo/pull/71) [`cfa827b`](https://github.com/pkishorez/monorepo/commit/cfa827be0e6d7d2bfcaac40170d672dbc38eaf38) Thanks [@kishorenuma](https://github.com/kishorenuma)! - auth-toolkit is rebuilt around three Caller Kinds (Browser, Device, OAuth) and four doors. The root exports one `Auth` guard for RPC and HttpApi; `server/rpc` and `server/http` each take one `auth({ url })`; `client/browser` and `client/device` each give one Layer for the `Accounts` service; `worker` exports `authWorker`, configured by `cookieDomain`, `brand` and an `oauth` resources map. Browser apps never hold tokens and send `expect-user`, so a switch in another tab fails Account Changed instead of acting as the wrong User. The Device and Consent Screens approve as a chosen Account without switching, and the Auth Worker's pages are a new Kabuki app whose pages arrive with their data, read by Loaders inside the worker. Their header has a light/dark Theme toggle, following the system until pressed. Breaking: `guard`, `server`, `server/cloud`, `client/web` and `client/cli` are gone, as are `Authz`, `SignIn`, `DeviceCode`, `trustedOrigins` and Test Sign-In.

  web-platform's Gate now runs on `Accounts` (XState removed), its Device Backend is the Local Backend, and its server takes `auth: { url, oauth? }`. effect-webrtc takes `cookieDomain` instead of `trustedOrigins`. kabuki's page types no longer ask a parent for what it provides to its child pages.

- [`f670d36`](https://github.com/pkishorez/monorepo/commit/f670d36ada4fc430a3e33571ea6488437806a555) Thanks [@pkishorez](https://github.com/pkishorez)! - The Kabuki devtools' Timeline fits a phone. The bar under the Map is only the Track, between Step back and Step on, with a sign that it is live. While a past Step is shown, a pill over the bar reads that Step and holds Fork here, which grows a new Branch from it, and Go live; it steps aside while the pointer reads the Track. Read, the Branch picker and Keep show only once there is room.

- [`cb88306`](https://github.com/pkishorez/monorepo/commit/cb88306a264dc9b2b16116b3caf90d5280590b7d) Thanks [@pkishorez](https://github.com/pkishorez)! - The Kabuki devtools' Timeline scrubs: press on the Track with a mouse or a finger and drag, and the Step shown follows it. The row holds still under the pointer, and glides while it is held near either end, so a long History can be scrubbed end to end on a phone. A finger on the Track scrubs instead of swiping it.
- Updated dependencies [[`cc56f42`](https://github.com/pkishorez/monorepo/commit/cc56f42da8b843480b231c7a6c75581bc3c09180), [`cfa827b`](https://github.com/pkishorez/monorepo/commit/cfa827be0e6d7d2bfcaac40170d672dbc38eaf38), [`2064962`](https://github.com/pkishorez/monorepo/commit/2064962d963b38babbae6e4481318ffef5ff6ca8), [`cfa827b`](https://github.com/pkishorez/monorepo/commit/cfa827be0e6d7d2bfcaac40170d672dbc38eaf38), [`cfa827b`](https://github.com/pkishorez/monorepo/commit/cfa827be0e6d7d2bfcaac40170d672dbc38eaf38), [`cfa827b`](https://github.com/pkishorez/monorepo/commit/cfa827be0e6d7d2bfcaac40170d672dbc38eaf38), [`42b55f4`](https://github.com/pkishorez/monorepo/commit/42b55f470d7451a8bb6caca421a1aae79e330b0b)]:
  - @kestack/kabuki@0.0.3
  - @kestack/rpc-toolkit@0.0.3
  - @kestack/auth-toolkit@0.0.3
  - @kestack/std-toolkit@0.0.3
  - laymos@0.0.14
  - @kestack/use-gesture@0.0.1
  - @kestack/use-keys@0.0.1

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
