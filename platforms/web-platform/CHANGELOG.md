# @kestack/ui-toolkit

## 0.0.6

### Patch Changes

- [#105](https://github.com/pkishorez/monorepo/pull/105) [`b9743d7`](https://github.com/pkishorez/monorepo/commit/b9743d7e3b0940f20c83c1e97f335ff4c61c7a79) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The Devtools Dock takes `onPhones`. Turned off, a phone gets no corner button and the devtools stay closed, while the page keeps its place. Code turns it off, so the button no longer covers the Draft's Send and Stop on a phone.

- [#110](https://github.com/pkishorez/monorepo/pull/110) [`30b99d1`](https://github.com/pkishorez/monorepo/commit/30b99d1a28c00bb614a0a5180d05cb4355720eed) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Child Emits to its parent, a Child is made with `child`, and an Update gives only what changes. This is a breaking change.

  - A Definition takes `emits`, what the Actor may tell its parent. An Update returns `emit`, and the parent's slot turns each one into one of its own Messages: `child(LoginLive, { emits: { SignedIn: ({ user }) => ({ _tag: 'LoggedIn', user }) } })`. That Message is in the History as its own entry, Sent by the Child, with the Source `{ kind: 'emit', instance, name }`. Use it in place of a Capability a parent Provides only so its Child can call back.
  - A level's `children` is a function handed `child`: `children: (child) => ({ rows: child(RowLive, { each, input, props }) })`. Every function in it is typed from the parent's data at that level, its State narrowed in a State's block, and checked against the Child's Actor. A slot written as `{ actor, … }` no longer compiles. A Child that needs nothing is `child(TodosLive)`.
  - The blocks of the States are written under `states`, not `state`.
  - The Model is always a struct, and an Update's `model` holds only the fields that change: `{ model: { draft: text } }`. A Model whose fields all stay the same stays the same object, so its Views do not draw again.
  - `Actor.define` and `Page.define` take each Schema whole or as what it is made of: `model: { count: Schema.Number }`, `message: { Added: {}, Removed: { id: Schema.String } }`.
  - `Router.app` is `Router.view`: it gives the Router's View, which `View.app` runs.
  - std-toolkit: `Replicas.child([…])` is `Replicas.actor([…])`, placed as `child(Replicas.actor([…]))`.

- [#107](https://github.com/pkishorez/monorepo/pull/107) [`3e336a0`](https://github.com/pkishorez/monorepo/commit/3e336a09571e36f3934f47935f5864690b959497) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Kabuki's paths are reorganized. This is a breaking change.

  - A layer's path gives only the values an app is made of. `@kestack/kabuki` gives `Actor`, `Command`, `History` and `Runtime`. `@kestack/kabuki/react` gives `View`, `useChild` and `useChildren`. `@kestack/kabuki/routing` gives `Page`, `Router`, `Navigation` and `useRouter`. `@kestack/kabuki/start` gives `Start`.
  - Each folder is now a path of its own that gives its value and every type that goes with it, and nothing else: `@kestack/kabuki/core/actor`, `core/command`, `core/history`, `core/runtime`, `core/snapshot`, `react/view`, `routing/page`, `routing/router`, `routing/capabilities` and `start/app`. For example, `import type { Running } from '@kestack/kabuki/core/runtime'`.
  - Some values moved to a folder path:
    - `Stopped` → `core/runtime`
    - `useLive` → `react/view`
    - `useElementScrollRestoration` → `routing/router`
    - `Loading`, with `Loading.memory` and `Loading.cached` (formerly `Router.memory` and `Router.cached`) → `routing/capabilities`
    - `handle`, `instanceAt` and `isMany` → `Snapshot.handle`, `Snapshot.instanceAt` and `Snapshot.isMany`, from `core/snapshot`
  - No longer exported: `Replay`, `outcomeOf`, `init`, `restore`, `isRestore`, `isHistory`, `lazyOf` and `RUN`. Use `history.seek`, `history.snapshotAt` and `history.outcome` instead of the replay helpers.
  - `toReact(actor, view, layer, options)` is now `View.app(view, { layer, ...options })`. The Layer may be left out while the tree Requires nothing.
  - `Router.app(router, AppView)` returns the Router's View, which `View.app` starts at the browser's URL: `View.app(Router.app(router, AppView), { layer })`. It no longer needs `.view` or `input: startAt`.
  - The `Page.NotFound` and `Page.Redirect` types are now `NotFoundError` and `RedirectTo`, and the `Start.DocumentProps` type is `DocumentProps` from `@kestack/kabuki/start/app`.
  - The adapters have shorter paths: `@kestack/kabuki/routing/browser`, `@kestack/kabuki/routing/tanstack`, `@kestack/kabuki/start/cloudflare` and `@kestack/kabuki/start/nitro`.
  - Inside, each layer is regrouped:
    - React is `react/view`, with its drawing in `react/view/draw`.
    - The Router is split into one file per job, with the address adapter and scroll restoration under it.
    - Start's shared part is `start/app`, with `start/app/protocol` for what the server and the browser agree on.
    - Command has a folder of its own.
    - Helpers that only other layers use sit in nested folders that no path exports.

  The other packages move to the new paths. What they do does not change.

- [#104](https://github.com/pkishorez/monorepo/pull/104) [`0346a01`](https://github.com/pkishorez/monorepo/commit/0346a012e50c4c35fabfc9b7a831f91f1469650a) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The Sidebar opens or closes once a Swipe, carried by its momentum, travels 30% of its width rather than half, so a relaxed drag does it on a phone.
- Updated dependencies [[`30b99d1`](https://github.com/pkishorez/monorepo/commit/30b99d1a28c00bb614a0a5180d05cb4355720eed), [`3e336a0`](https://github.com/pkishorez/monorepo/commit/3e336a09571e36f3934f47935f5864690b959497)]:
  - @kestack/kabuki@0.0.5
  - @kestack/auth-toolkit@0.0.6
  - laymos@0.0.17
  - @kestack/use-gesture@0.0.2
  - @kestack/use-keys@0.0.2

## 0.0.5

### Patch Changes

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`ff91379`](https://github.com/pkishorez/monorepo/commit/ff91379bba26c81bad7e4fb0325af31bfe9f9b5f) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The Account Switcher's menu dims the screen behind it. `DropdownMenuContent` with `backdrop` dims instead of blurring.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`ff91379`](https://github.com/pkishorez/monorepo/commit/ff91379bba26c81bad7e4fb0325af31bfe9f9b5f) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The App Shell floats as a window only when given `floating`; otherwise it fills the screen. The sidebar's resize handle sits on the dividing line, and the header shows its bottom edge only once the page scrolls.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`8b4ff10`](https://github.com/pkishorez/monorepo/commit/8b4ff102bf78eb9bf94125e59b9657baafe0f19e) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Every value Connect's RPC sends is an ESchema, so a newer side reads an older one.

  - `@kestack/std-toolkit`: an ESchema reads and migrates any known version, and fails a newer one with `OutdatedVersion`. New `eschemaOf`, and `OnOutdated` in `./replica`.
  - `@kestack/connect`: breaking: wire types are ESchemas; use `X.schema` for an Effect Schema. Calls fail with `VersionGap` when the two sides' versions don't match.
  - `@kestack/web-platform`: new `updateToNewest` in `./pwa`.
  - Code reloads to its newest build when it reads something newer, and says when a Connection is too old.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`68843e3`](https://github.com/pkishorez/monorepo/commit/68843e3f088acd0c41e6a908db5cb62a0f12b5ca) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Renames: a Machine is now a Connection, an App Group a Plugin, and a socket's status its Link.

  - Breaking: every `Machine*` name is `Connection*`, and `machineId` is `connectionId`.
  - Breaking: socket `connection` status is `link` (`linking`, `linked`, `relinking`).
  - Breaking: `AppGroup`, `codeGroup` and `groups` are `Plugin`, `codePlugin` and `plugins`.
  - Breaking: every Connection signs in and registers again.
  - Code's routes are `/c/:connectionId/…`, and its saved Connection list starts empty.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`0bed3f8`](https://github.com/pkishorez/monorepo/commit/0bed3f83e9701bcb850c94f4d7864445a5f9108d) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The Devtools Dock hides its devtools when closed instead of unmounting them, so their state stays. Kabuki Devtools cards show their key on a short readable line, and the fold button is larger and easier to hit.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`609ac1f`](https://github.com/pkishorez/monorepo/commit/609ac1f51a43f7890ba749fba58d4cc84b9048d5) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Under `vite dev`, `app()` forwards Kabuki Sessions at `/__devtools/kabuki/connect` on the site's own origin to DevTools, and nothing else of DevTools. `app({ devtools })` sets the server, or `false` for none.

- [`e366e57`](https://github.com/pkishorez/monorepo/commit/e366e57baa3c6ed2dfce5eb9804c94961f0506ed) Thanks [@pkishorez](https://github.com/pkishorez)! - Every touch Drawer, not only a tall one, now sits above the on-screen keyboard in the part of the page left visible, and with a field in it focused takes all of that but the status bar, so on iOS nothing in it is hidden under the keyboard.

  While the keyboard is up, a Drawer keeps no room at its foot for the home indicator the keyboard covers, so it sits right on the keyboard; `--visible-safe-bottom` gives that room to what is inside it.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`ff91379`](https://github.com/pkishorez/monorepo/commit/ff91379bba26c81bad7e4fb0325af31bfe9f9b5f) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The theme gains `running`, `added`, `changed` and `removed` colours.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`c012561`](https://github.com/pkishorez/monorepo/commit/c012561d0faa31aa672ae341876db80bd0471deb) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The Kabuki Inspector moved into DevTools, rebuilt on a canvas over a Timeline, with Time Travel and Fork.

  Breaking: `KabukiDevtools` and `Inspector` are gone from web-platform, and `story` is no longer played. `recipes/devtools` keeps `DevtoolsDock`.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`ff91379`](https://github.com/pkishorez/monorepo/commit/ff91379bba26c81bad7e4fb0325af31bfe9f9b5f) Thanks [@kishorenuma](https://github.com/kishorenuma)! - `MarkdownViewer` draws every code block as a block, never an inline chip. Long lines scroll sideways inside it.

- [`e04aec7`](https://github.com/pkishorez/monorepo/commit/e04aec74589ad7786dd13b070ac209af73e36c40) Thanks [@pkishorez](https://github.com/pkishorez)! - A Drawer opened inside another keeps its backdrop clear, so a tap outside still closes it but the page is dimmed once, by the Drawer under it, rather than twice to near black.

- [#93](https://github.com/pkishorez/monorepo/pull/93) [`01659ef`](https://github.com/pkishorez/monorepo/commit/01659ef9beddda274646bed98e0a3879fe61bd3c) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A touch Drawer holding a field stops animating on its own once it has risen, so on iOS it no longer jitters against the keyboard: the keyboard and the page's scroll move and size it at once, and only a swipe or closing animates it.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`0bed3f8`](https://github.com/pkishorez/monorepo/commit/0bed3f83e9701bcb850c94f4d7864445a5f9108d) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Breaking: `@kestack/web-platform/ui/components/lucide` and `/motion` are gone. Import from `lucide-react` and `motion/react`.

  code's first load is about 570 KB gzipped, down from about 1 MB. Pages load on their own, and `pnpm size` fails past the budget.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`ad39df1`](https://github.com/pkishorez/monorepo/commit/ad39df120da50c3eaf168f09d3f5b8dd560f9614) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Drawers and Top Dialogs stay above the iOS 26 on-screen keyboard. A focused field scrolls into view inside its layer, not by scrolling the page.

  New: `useVisibleViewport`, `visibleOf`, `useKeyboardOver`, `overBox`, and `SWIPE_DISMISS` for sheets that dismiss like the Drawer.

- Updated dependencies [[`278b105`](https://github.com/pkishorez/monorepo/commit/278b1054fcc9b53036a7df5b44fe90c21dbde480), [`7bcb8db`](https://github.com/pkishorez/monorepo/commit/7bcb8dbdc934779cae6a86fad96a367c9923e747), [`7bcb8db`](https://github.com/pkishorez/monorepo/commit/7bcb8dbdc934779cae6a86fad96a367c9923e747), [`110f14f`](https://github.com/pkishorez/monorepo/commit/110f14f798dde8057ee65e101325128102968291), [`ff91379`](https://github.com/pkishorez/monorepo/commit/ff91379bba26c81bad7e4fb0325af31bfe9f9b5f), [`cacaf15`](https://github.com/pkishorez/monorepo/commit/cacaf15813485ad3ba06e7c656525c63ac4972ba), [`139011f`](https://github.com/pkishorez/monorepo/commit/139011fe37d4cb1960fb30091f42308cf56e0dd2), [`0bed3f8`](https://github.com/pkishorez/monorepo/commit/0bed3f83e9701bcb850c94f4d7864445a5f9108d)]:
  - @kestack/auth-toolkit@0.0.5
  - @kestack/kabuki@0.0.4
  - laymos@0.0.16
  - @kestack/use-gesture@0.0.2
  - @kestack/use-keys@0.0.2

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
