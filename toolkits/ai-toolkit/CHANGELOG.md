# @kestack/ai-toolkit

## 0.0.7

### Patch Changes

- [`d07ead4`](https://github.com/pkishorez/monorepo/commit/d07ead4c905eeb32e56945f7090c8e457c6733ff) Thanks [@pkishorez](https://github.com/pkishorez)! - A Background Job's output can be followed live.

  **Added**

  - `Agent.backgroundJobOutput(id)` streams what a shell job writes: the last 64 KiB of it at once, then each piece as it comes, until the job ends. Claude Code's is read from the file its tool result names; Codex's comes from `item/commandExecution/outputDelta`, kept from the command's start so it can be read however late it is asked for. A subagent job gives nothing.
  - A `BackgroundJob` carries `tokens`, a subagent's tokens so far, from Claude Code's `task_progress`.
  - A Codex background terminal's job names its `toolCallId`, the command's item.
  - Connect's `backgroundJobOutput` RPC streams one Session's job output.

  **Changed**

  - A Session's record keeps its jobs without `tokens`, so its stored shape is as before, and a subagent's progress never rewrites it.

- [`c2585bc`](https://github.com/pkishorez/monorepo/commit/c2585bcc922903271d4e6c01d0da622ee68e0b00) Thanks [@pkishorez](https://github.com/pkishorez)! - A `toolResult` says when its call went on in the background, asked or not.

  **Fixed**

  - Claude Code may launch a subagent async with no `run_in_background` in its call, and gives a command a background task on its own. Its result now carries `background: true` (from `isAsync`, `status: 'async_launched'` or `backgroundTaskId`), so a client knows the call runs on until its `jobEnded`, rather than taking the "launched" result as its end. `PROJECTION_VERSION` is 7.

- [`04f120d`](https://github.com/pkishorez/monorepo/commit/04f120d75067a8add528b10de6a4bb8378d0456b) Thanks [@pkishorez](https://github.com/pkishorez)! - What a background subagent writes is kept as it comes, and a Background Job's end is a Message.

  **New**

  - `Agent.between`: what the agent writes while no Turn runs, a background subagent's records and a job's end, as it comes. Claude Code no longer holds them for the next Turn; Codex and the fake harness give none.
  - A `jobEnded` Part, projected from Claude Code's `task_notification`: the job, the tool call that started it, and `done`, `failed` or `stopped`.
  - A `toolCall` may be `background`: its result only says it started.
  - A `turnStarted` may carry `cutOff`: the Turn and the Background Jobs a stop cut off before it.
  - `BackgroundJob.toolCallId`: the tool call that started a job, when the harness says.
  - Messages are v3, and `PROJECTION_VERSION` is 6.

- [`74e34c3`](https://github.com/pkishorez/monorepo/commit/74e34c3dcda784dae45f5c1b3b42349c5d2869a2) Thanks [@pkishorez](https://github.com/pkishorez)! - A Codex `usage` counts its input as Claude Code's does.

  **Fixed**

  - Codex counts what it read from and wrote to the cache inside its input, so its `inputTokens` came out larger than Claude Code's for the same work, and a sum of input and cache read counted the cache twice. A Codex `usage` now gives only what was sent fresh as `inputTokens`, with `cacheReadTokens` and, when there are any, `cacheWriteTokens` apart. `UsageSchema` says what each field means. `PROJECTION_VERSION` is 8.

- [#128](https://github.com/pkishorez/monorepo/pull/128) [`02c3bcb`](https://github.com/pkishorez/monorepo/commit/02c3bcbe390c4155ebe49f398ac273a75a34c116) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Dictation can be heard while it is recorded, as a Take: its audio goes in numbered stretches and its text comes back as it goes.

  **Added**

  - `Speech` has `watchTake`, `addTakeAudio` and `endTake`. A Take switches Speech to Text on if it is off, says how far the model has downloaded meanwhile, keeps the audio, and transcribes only what is not yet settled, cutting a long tail at its quietest moment, and lets go of the audio before the cut. A stretch sent again is ignored, so a sender that lost track, as after a restart, sends them all again. A Take watched is never dropped, however long its model downloads; one nobody watches or touches for 10 minutes is. One dropped or broken before it is Done fails whoever watches it. Calls that reach a new Take together start one.
  - The code Plugin's API has the same three calls, and `TakeHeard`: `Downloading`, `Heard` or `Done`.

- Updated dependencies [[`df76ba6`](https://github.com/pkishorez/monorepo/commit/df76ba60280fdb5405ca85b29fe67f8604de18bf), [`2678376`](https://github.com/pkishorez/monorepo/commit/2678376efd3ce396d3f491c63c615169112eccd9), [`6cf1d7f`](https://github.com/pkishorez/monorepo/commit/6cf1d7fb87f1b98311e1d6ab9b86b8f233e0c707)]:
  - @kestack/kabuki@0.0.6
  - @kestack/std-toolkit@0.0.7

## 0.0.6

### Patch Changes

- [#104](https://github.com/pkishorez/monorepo/pull/104) [`2415978`](https://github.com/pkishorez/monorepo/commit/24159786902051e8ef07399c0f30b26b7212f2b5) Thanks [@kishorenuma](https://github.com/kishorenuma)! - **Fixed:** Claude Code's `open` now waits until Claude Code has initialized, as Codex's already did. A Harness Binary that exits at once fails the `open` with the reason, instead of failing the first Turn.

- [#105](https://github.com/pkishorez/monorepo/pull/105) [`eb52902`](https://github.com/pkishorez/monorepo/commit/eb5290287ce446387bececbce96c5002d41a3165) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Images a tool returns, such as a file the agent reads, now come through whole instead of as `[image]`. A `toolResult` Part carries them in `images` (media type and base64 data), and its `output` is just the text.
- Updated dependencies [[`85d0632`](https://github.com/pkishorez/monorepo/commit/85d063272beee88e041d0fb0734af2e0a0ceeb68), [`30b99d1`](https://github.com/pkishorez/monorepo/commit/30b99d1a28c00bb614a0a5180d05cb4355720eed), [`daadcde`](https://github.com/pkishorez/monorepo/commit/daadcdebc5f79a7a8b92b4edbb31a6083ff3414a), [`3e336a0`](https://github.com/pkishorez/monorepo/commit/3e336a09571e36f3934f47935f5864690b959497)]:
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
