# @kestack/devtools

## 0.0.17

### Patch Changes

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

## 0.0.16

### Patch Changes

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`609ac1f`](https://github.com/pkishorez/monorepo/commit/609ac1f51a43f7890ba749fba58d4cc84b9048d5) Thanks [@kishorenuma](https://github.com/kishorenuma)! - DevTools lists Kabuki Sessions by app, then Environment (from `connect({ environment })`, else the page's host). `devtools kabuki sessions` prints the same tree and takes `--app` and `--env`.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`dd00cf6`](https://github.com/pkishorez/monorepo/commit/dd00cf6204350a87bc938df525784ba47723f233) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A tab keeps the Kabuki Session name it asked for, so a reload no longer drifts to `-2`, `-3`.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`0730b39`](https://github.com/pkishorez/monorepo/commit/0730b39b7e2a384505b1e35213e7222ec979597d) Thanks [@kishorenuma](https://github.com/kishorenuma)! - DevTools has a Kabuki page at `/kabuki`: live Kabuki Sessions on the left, and the Inspector on the one picked. `?session=<name>` opens one directly.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`0730b39`](https://github.com/pkishorez/monorepo/commit/0730b39b7e2a384505b1e35213e7222ec979597d) Thanks [@kishorenuma](https://github.com/kishorenuma)! - DevTools keeps every Kabuki app that connects as a Kabuki Session. `devtools kabuki sessions`, `history`, `changes` and `snapshot` read them. `@kestack/devtools-kabuki/server` holds the routes.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`d536eba`](https://github.com/pkishorez/monorepo/commit/d536eba2f204ac16b3a0cd867a4c6f852c6e8dfe) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Kabuki in DevTools is steadier: the `/kabuki` list survives a server restart, follows each app's page, and waits for a Session's first answer. DevTools works at `localhost` as well as `127.0.0.1`.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`c012561`](https://github.com/pkishorez/monorepo/commit/c012561d0faa31aa672ae341876db80bd0471deb) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Kabuki apps connect to DevTools as Kabuki Sessions, read through the Kabuki Session Api, with an in-page Inspector too.

- [#101](https://github.com/pkishorez/monorepo/pull/101) [`ef13d1f`](https://github.com/pkishorez/monorepo/commit/ef13d1f2295a29b051b99e5be3a2338ef9cf3b85) Thanks [@kishorenuma](https://github.com/kishorenuma)! - `devtools` installs as one minified file. Its only dependencies are `oxc-parser`, `oxc-resolver` and `tsx`, which can't be bundled. The npm package is only the CLI and its UI: the `./lotel` exports are left out.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`609ac1f`](https://github.com/pkishorez/monorepo/commit/609ac1f51a43f7890ba749fba58d4cc84b9048d5) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Under `vite dev`, `app()` forwards Kabuki Sessions at `/__devtools/kabuki/connect` on the site's own origin to DevTools, and nothing else of DevTools. `app({ devtools })` sets the server, or `false` for none.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`c012561`](https://github.com/pkishorez/monorepo/commit/c012561d0faa31aa672ae341876db80bd0471deb) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The Kabuki Inspector moved into DevTools, rebuilt on a canvas over a Timeline, with Time Travel and Fork.

  Breaking: `KabukiDevtools` and `Inspector` are gone from web-platform, and `story` is no longer played. `recipes/devtools` keeps `DevtoolsDock`.

- [#101](https://github.com/pkishorez/monorepo/pull/101) [`cacaf15`](https://github.com/pkishorez/monorepo/commit/cacaf15813485ad3ba06e7c656525c63ac4972ba) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Browser stories load `playwright-core` from the project first, as they do Vite, so they run from DevTools' bundle too.

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @kestack/std-toolkit@0.0.4
  - laymos@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies [[`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1)]:
  - laymos@0.0.14
  - @kestack/std-toolkit@0.0.3

## 0.0.13

### Patch Changes

- Updated dependencies []:
  - @kestack/std-toolkit@0.0.2
  - laymos@0.0.13

## 0.0.12

### Patch Changes

- [`83f6125`](https://github.com/pkishorez/monorepo/commit/83f6125efe19c5d990bf115b560c79bc5300abe6) Thanks [@pkishorez](https://github.com/pkishorez)! - Breaking: `@kestack/lotel` is now part of `@kestack/devtools`, and so are the DevTools views that lived in the private `@devtools/ui`. Import Lotel from `@kestack/devtools/lotel`, `@kestack/devtools/lotel/rpc` and `@kestack/devtools/lotel/telemetry` instead of `@kestack/lotel`, `@kestack/lotel/rpc` and `@kestack/lotel/telemetry`. `@kestack/lotel/sqlite` is gone: `sqliteTelemetryStoreLayer` comes from `@kestack/devtools/lotel`. The Lotel subpaths ship built JavaScript with types.

  `@kestack/devtools/rpc` is no longer exported: only DevTools' own server, browser UI and Client Commands use it.

  Lotel's Span and Log Records drop `flowId` and `participantName`; records stored with them still read.

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - Breaking: DevTools now hosts two Tools, Lotel and Monoverse, with Laymos opened inside Monoverse. The Flow Tool, its `/flow` route, `list-flows`, `get-flow` and `devtools snapshot` are removed, and so is the `/laymos` route. In `@kestack/devtools/rpc`, `NotPnpmWorkspaceError` is now `NoPackageJsonError`, and `FlowEntryEntitySchema`, `RegistryToolSchema` and `ProjectEntryEntitySchema` are gone.

  Monoverse reads npm, yarn, bun and pnpm monorepos, and a single package too (including a pnpm one whose `pnpm-workspace.yaml` lists no `packages`), and draws Packages the way Laymos draws a Project, with changed, added and deleted ones marked. The Stories tab shows the new Laymos Stories, with recordings for browser Proofs, and only reloads the Proof files that changed.

- Updated dependencies [[`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9), [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9)]:
  - laymos@0.0.12
  - @kestack/std-toolkit@0.0.1
