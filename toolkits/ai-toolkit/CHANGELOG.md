# @kestack/ai-toolkit

## 0.0.6

### Patch Changes

- [#104](https://github.com/pkishorez/monorepo/pull/104) [`2415978`](https://github.com/pkishorez/monorepo/commit/24159786902051e8ef07399c0f30b26b7212f2b5) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Claude Code's `open` succeeds only once Claude Code has initialized, as Codex's already did: a Harness Binary that exits at once fails the open, with why, rather than the first Turn.

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

- [#105](https://github.com/pkishorez/monorepo/pull/105) [`eb52902`](https://github.com/pkishorez/monorepo/commit/eb5290287ce446387bececbce96c5002d41a3165) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Images a tool gives back, such as a file the agent reads, come through whole, not as `[image]`.

  - ai-toolkit: a `toolResult` Part carries them as `images`, each its media type and base64 data, never cut; its `output` is the text alone.
  - Code: they show as thumbnails under what the tool gave back, each opened whole over the page by a tap.

- Updated dependencies [[`30b99d1`](https://github.com/pkishorez/monorepo/commit/30b99d1a28c00bb614a0a5180d05cb4355720eed), [`3e336a0`](https://github.com/pkishorez/monorepo/commit/3e336a09571e36f3934f47935f5864690b959497)]:
  - @kestack/kabuki@0.0.5
  - @kestack/std-toolkit@0.0.6

## 0.0.5

### Patch Changes

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`5c6af01`](https://github.com/pkishorez/monorepo/commit/5c6af010e18f3f7d371f9c1dbde2724e7502170f) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Claude Code and Codex can ask Agent Questions instead of having them declined. An Agent's `questions` lists the open ones; `answer` answers one by Item id, or declines it with null.

  Questions show in the transcript as a `question` tool call and a `questionAnswered` part. `PROJECTION_VERSION` is 5. The fake harness gains `refuseAnswers` and `lateAnswers`.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`68843e3`](https://github.com/pkishorez/monorepo/commit/68843e3f088acd0c41e6a908db5cb62a0f12b5ca) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Renames: a Machine is now a Connection, an App Group a Plugin, and a socket's status its Link.

  - Breaking: every `Machine*` name is `Connection*`, and `machineId` is `connectionId`.
  - Breaking: socket `connection` status is `link` (`linking`, `linked`, `relinking`).
  - Breaking: `AppGroup`, `codeGroup` and `groups` are `Plugin`, `codePlugin` and `plugins`.
  - Breaking: every Connection signs in and registers again.
  - Code's routes are `/c/:connectionId/…`, and its saved Connection list starts empty.

- [#93](https://github.com/pkishorez/monorepo/pull/93) [`c0a5d29`](https://github.com/pkishorez/monorepo/commit/c0a5d290563061ef77b14981674a76f55b697667) Thanks [@kishorenuma](https://github.com/kishorenuma)! - `configFolderOf` says which config folder a Harness Account really uses, as `ConfigFolderInfo`: its own; else, with none, `CLAUDE_CONFIG_DIR` or `CODEX_HOME` from the environment it runs in; else `~/.claude` or `~/.codex`. What runs does not change.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`2b38583`](https://github.com/pkishorez/monorepo/commit/2b385836246f56ef3e95479760b734534b2930a2) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Turn cut off by Connect stopping is resumed once when Connect starts again.

  - The `turnStarted` Part carries `resumed: true`; `MessageSchema` is at v2, and v1 reads unchanged.
  - The Store's `lastRaw` is `lastTurn`.
  - Code shows "Resumed after Connect restarted".

- [#93](https://github.com/pkishorez/monorepo/pull/93) [`5bbfd47`](https://github.com/pkishorez/monorepo/commit/5bbfd473f4c906faa0eca9636f6d53817a9f0f9f) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Turn that fails, and Claude Code's models or Skills that cannot be listed, say why: a project folder that no longer exists, a Harness Binary that is missing or cannot run, a lost login, a rate limit, or the exit code and last stderr line; else what the harness said. Before, Claude Code's failures read "Claude Code failed" and Codex's "initialize: codex app-server failed".
- Updated dependencies [[`8b4ff10`](https://github.com/pkishorez/monorepo/commit/8b4ff102bf78eb9bf94125e59b9657baafe0f19e), [`7bcb8db`](https://github.com/pkishorez/monorepo/commit/7bcb8dbdc934779cae6a86fad96a367c9923e747), [`7bcb8db`](https://github.com/pkishorez/monorepo/commit/7bcb8dbdc934779cae6a86fad96a367c9923e747), [`110f14f`](https://github.com/pkishorez/monorepo/commit/110f14f798dde8057ee65e101325128102968291), [`ff91379`](https://github.com/pkishorez/monorepo/commit/ff91379bba26c81bad7e4fb0325af31bfe9f9b5f)]:
  - @kestack/std-toolkit@0.0.5
  - @kestack/kabuki@0.0.4

## 0.0.4

### Patch Changes

- [#92](https://github.com/pkishorez/monorepo/pull/92) [`3bfd2c8`](https://github.com/pkishorez/monorepo/commit/3bfd2c82dfb21a7819b1c724cd1a32fb55092003) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The harnesses run the Claude Code and Codex the user installed, as one of their logins, and the package ships no agent of its own.

  - Breaking: `HarnessBinaries` is `HarnessAccount`: the `binary` and `configFolder` (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`) one call runs as, so two logins of one harness run side by side. `binaryAt` takes an account, and `Models` asks each account for its own models.
  - Breaking: `@openai/codex` is no longer a dependency; Codex runs `codex` from PATH, and Claude Code no longer falls back to the SDK's own binary. A harness that is not installed says how to install it.
  - The Claude Agent SDK's JavaScript ships in `dist/vendor`, so npm no longer downloads its 270 MB binary.
  - Speech to Text's runtime, `sherpa-onnx-node`, is fetched from the npm registry and checked when Speech to Text is switched on, instead of being a dependency.

- Updated dependencies []:
  - @kestack/std-toolkit@0.0.4
  - @kestack/kabuki@0.0.3

## 0.0.3

### Patch Changes

- [#88](https://github.com/pkishorez/monorepo/pull/88) [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - ai-toolkit is now the harness and nothing more: its doors are `contract`, `harness`, `harness/fake`, `speech` and `speech/fake`.

  - Breaking: the engine, the Machine, its CLI and the `api`, `client`, `server` and `machines` doors move to `@kestack/connect`.
  - An Agent is plain Effects (`HarnessSession` is `Agent`, `Titler` is `OneShotPrompt`), with forks, asks, steers, attachments, Skills, Background Jobs and per-login model lists.
  - Text and reasoning stream in sentence-sized chunks, and Claude runs the Claude Code installed on PATH when there is one.
  - Speech to Text runs Parakeet on the Machine, downloaded from Hugging Face.

- Updated dependencies [[`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1)]:
  - @kestack/kabuki@0.0.3
  - @kestack/std-toolkit@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @kestack/std-toolkit@0.0.2

## 0.0.1

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - Moves to stable Effect 4: the `effect` peer is now `^4.0.0`. ai-toolkit's `makePlaygroundSync` takes `store` instead of `platform`.
- Updated dependencies [[`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9)]:
  - @kestack/std-toolkit@0.0.1
