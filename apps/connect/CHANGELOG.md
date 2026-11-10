# @kestack/connect

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

- [#118](https://github.com/pkishorez/monorepo/pull/118) [`a88fc46`](https://github.com/pkishorez/monorepo/commit/a88fc4603b3327a1f8f0794f9b8445023aa131d5) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Connection can be given a Display Name, which Cloud Connect keeps.

  **Added**

  - `Rename` on Cloud Connect gives one of the caller's Connections a Display Name, trimmed, or clears it when given null or a blank one. It works while the Connection is out of reach.
  - `Connection` v2 carries `displayName`, null until one is given. `name` stays the Computer Name the Connection reports, so two Connections given the same Display Name can still be told apart.
  - `DISPLAY_NAME_MAX`, the longest Display Name: 64 characters.

  **Changed**

  - A Report no longer changes the Display Name, only the Computer Name.
  - A Report is answered with `ReportAnswer`, which is v1 of `Connection` on the wire, so every `ke-connect` already released reads it as before.

- [`e5ae350`](https://github.com/pkishorez/monorepo/commit/e5ae35091165ae901747411880ee6da4a9b21ed2) Thanks [@pkishorez](https://github.com/pkishorez)! - A Heartbeat that crashes no longer stops the ones after it.

  **Fixed**

  - A Report that crashed, such as one Cloud Connect failed with a `DatabaseError`, is logged as not sent, and the next Heartbeat tries again. Before, it ended the Heartbeat for good, and the Connection showed down until `ke-connect` was restarted.

- [`9e04093`](https://github.com/pkishorez/monorepo/commit/9e04093be077abe1271077cc5f15eaf4624ce2b9) Thanks [@pkishorez](https://github.com/pkishorez)! - A stop tells the agent what it cut off, and a cancel stops everything.

  **New**

  - What the agent writes between Turns is stored as it comes, in the Session's latest Turn.
  - A Session record is v3, with the Background Jobs it last had. A restart Resumes a Session that had jobs running, as it did one with a Turn running, with a prompt that names each Turn, subagent and command cut off. A message after the agent closed with jobs running tells it of them first.
  - A cancel also stops every Background Job, whether a Turn runs or not.

- [#128](https://github.com/pkishorez/monorepo/pull/128) [`02c3bcb`](https://github.com/pkishorez/monorepo/commit/02c3bcbe390c4155ebe49f398ac273a75a34c116) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Dictation can be heard while it is recorded, as a Take: its audio goes in numbered stretches and its text comes back as it goes.

  **Added**

  - `Speech` has `watchTake`, `addTakeAudio` and `endTake`. A Take switches Speech to Text on if it is off, says how far the model has downloaded meanwhile, keeps the audio, and transcribes only what is not yet settled, cutting a long tail at its quietest moment, and lets go of the audio before the cut. A stretch sent again is ignored, so a sender that lost track, as after a restart, sends them all again. A Take watched is never dropped, however long its model downloads; one nobody watches or touches for 10 minutes is. One dropped or broken before it is Done fails whoever watches it. Calls that reach a new Take together start one.
  - The code Plugin's API has the same three calls, and `TakeHeard`: `Downloading`, `Heard` or `Done`.

- [#129](https://github.com/pkishorez/monorepo/pull/129) [`954b985`](https://github.com/pkishorez/monorepo/commit/954b985d18ebc28e2cb6c1c4fd8ebd4b056b2aae) Thanks [@pkishorez](https://github.com/pkishorez)! - A new folder is only a folder: `createFolder` no longer starts a git repository in it.

  **Changed**

  - `createFolder` makes the folder and nothing else. Whoever wants a repository there starts one.

  **Removed**

  - `gitInitError` from `CreatedFolder`.

- [`3a9aca6`](https://github.com/pkishorez/monorepo/commit/3a9aca6d91681c39cde11dcf22c239de63936c1e) Thanks [@pkishorez](https://github.com/pkishorez)! - A Project whose folder is inside a git repository, as a package of a monorepo, is a git Project.

  **Changed**

  - `branches` lists the repository's branches for a folder anywhere inside it, not only at its top, so the Branch Picker and New Worktree switch show for it.
  - A Session in such a Project runs in the same folder of its Worktree: a new Worktree's `packages/one`, or that of the Worktree a branch is out in.

- [`97a6eae`](https://github.com/pkishorez/monorepo/commit/97a6eae84de2e72fc45bb1e05ad0fc11916a66b3) Thanks [@pkishorez](https://github.com/pkishorez)! - A Session Resumed on start is active from after its cut-off Turn ended, never a moment before.

  **Fixed**

  - The Bootstrap Sweep set a Resumed Session's `activeAt` from the time it read before stamping the Turn's `turn.ended`, so it could come out a millisecond before its own `endedAt`.

## 0.0.6

### Patch Changes

- [#104](https://github.com/pkishorez/monorepo/pull/104) [`b8eac00`](https://github.com/pkishorez/monorepo/commit/b8eac00499dc3920c3cce10db1187537d459b45b) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Session in a git Project starts on the branch you pick.

  **New**

  - If that branch is checked out somewhere, the Session runs there. If not, the Project's folder switches to it, or the Session gets a new Worktree on its own `ke-code/` branch, named after its first Title.
  - The code Plugin lists a Project's branches and streams each step of a start.
  - A start whose git step or Agent fails (`HarnessFailed`) keeps nothing: no Session, no messages, and no Worktree or branch made for it while that branch has no commits of its own.
  - cli-platform: every Plugin gets a shared folder that outlives a Connection (`pluginShared`). New Worktrees live there.

  **Known limits**

  - A Project with no commits starts on its current branch and can't make a Worktree yet.
  - If Connect stops between a new Session's first message and its save, that message is left without a Session.

- [#105](https://github.com/pkishorez/monorepo/pull/105) [`eb52902`](https://github.com/pkishorez/monorepo/commit/eb5290287ce446387bececbce96c5002d41a3165) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Images a tool returns, such as a file the agent reads, now come through whole instead of as `[image]`. A `toolResult` Part carries them in `images` (media type and base64 data), and its `output` is just the text.

## 0.0.5

### Patch Changes

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`5c6af01`](https://github.com/pkishorez/monorepo/commit/5c6af010e18f3f7d371f9c1dbde2724e7502170f) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The code Plugin streams each Session's Agent Questions (`agentQuestions`) and answers them (`answerQuestion`, null to decline). Questions live only while their Turn runs. Answering one no longer asked fails with `QuestionNotAsked`.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`7a091d0`](https://github.com/pkishorez/monorepo/commit/7a091d08674679b9989b0ec45d332a7e15561325) Thanks [@kishorenuma](https://github.com/kishorenuma)! - - `@kestack/cli-platform`: `Downloads.use(key)` marks an entry used, so a running Plugin's file is never pruned.
  - `ke-connect serve` deletes downloads unused for 30 days. cloudflared is pinned to 2026.10.3.
  - A deploy ships the code Plugin to R2, and Cloud Connect serves it at `/plugins/<name>/<sha256>.mjs`.
  - Code shows when a Connection's Plugin is updating or stopped, and when `ke-connect` needs an update.
  - The dev script runs `ke-connect` as `dev-<branch>` and removes Connections of deleted branches.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`278b105`](https://github.com/pkishorez/monorepo/commit/278b1054fcc9b53036a7df5b44fe90c21dbde480) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Every Plugin runs at a Release Cloud Connect names, and Code calls it at the Release it was built with.

  **Breaking:** ke-connect, Cloud Connect and Code must update together; nothing reads data from earlier releases. Update with `npm i -g @kestack/connect@latest`, and delete an old `code.db`.

  - Each Plugin is served only at `/<plugin>/<sha256>/rpc`; another Release gets close code 4409, `PLUGIN_MISMATCH`.
  - A Connection older than the Minimum Connect stops and says how to update. It starts its Plugins at the last wanted Releases while Cloud Connect is down.
  - A Connection that signed in before starts while Cloud Connect is down.
  - Cloud Connect has its own export, `@kestack/connect/cloud`; those names left `@kestack/connect/code`.
  - `pnpm release:plugin` builds a Plugin and adds it to its Release Log.
  - `@kestack/cli-platform`: `Downloads.fetch` takes `file:` URLs. A new Plugin process starts only after the old one exits. Of many `single` claims at once, exactly one wins.
  - `@kestack/auth-toolkit`: a Device's `url` may be an Effect, so it follows an Auth Worker that moves.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`24a8b63`](https://github.com/pkishorez/monorepo/commit/24a8b633b253a97a228f3072c4a337b2a1ca2d9a) Thanks [@kishorenuma](https://github.com/kishorenuma)! - `ke-connect` runs the code Plugin as its own process, downloaded at the version Cloud Connect names.

  - Breaking: `ke-connect serve [name]` runs the Connection `name` (default `main`) in its own folders. `list` shows every Connection; `remove <name>` replaces `logout`. `--name` and `--branch` are gone.
  - Breaking: a Connection belongs to the Cloud Connect it first signed in to.
  - Breaking: the `./connection` export is gone.
  - `pnpm build:plugin` bundles the code Plugin into one file.
  - `@kestack/cli-platform`: new `./plugins/contract`, safe in a browser or Worker.

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

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`9c24367`](https://github.com/pkishorez/monorepo/commit/9c24367342016ecf170e68c608bc2f4c9f3fc10a) Thanks [@kishorenuma](https://github.com/kishorenuma)! - `ke-connect` installs as one minified file with no dependencies, so it never pulls in mismatched kestack packages. The npm package is only the CLI: the code Plugin, which Connect downloads, and the library exports are left out.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`ff91379`](https://github.com/pkishorez/monorepo/commit/ff91379bba26c81bad7e4fb0325af31bfe9f9b5f) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Connection is named by its host name up to the first dot: `Ada-MacBook.local` is `Ada-MacBook`.

- [#93](https://github.com/pkishorez/monorepo/pull/93) [`a07846e`](https://github.com/pkishorez/monorepo/commit/a07846ede022c228ebf6c903fa2d6a9ec651e0d9) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Project says whether its folder exists: `folder` is `'present'` or `'missing'`. The Connection checks at start, every minute, and when a Turn fails.

- [#93](https://github.com/pkishorez/monorepo/pull/93) [`dd5157e`](https://github.com/pkishorez/monorepo/commit/dd5157e1e68f234964d00e9f246439ddb7f6b65c) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Removing a Project now deletes its Sessions too, stopping one that runs. The first start of this Connect deletes the Sessions that earlier removals left behind.

- [#93](https://github.com/pkishorez/monorepo/pull/93) [`c0a5d29`](https://github.com/pkishorez/monorepo/commit/c0a5d290563061ef77b14981674a76f55b697667) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Each `HarnessAccountInfo` has `resolvedConfigFolder`, the config folder it really runs with, beside the `configFolder` the user set. A Default Account with none set, on a Machine whose Connect was started with `CLAUDE_CONFIG_DIR` or `CODEX_HOME`, now says that folder, and that the environment chose it, where it said `~/.claude` or `~/.codex`. What runs does not change.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`2b38583`](https://github.com/pkishorez/monorepo/commit/2b385836246f56ef3e95479760b734534b2930a2) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Turn cut off by Connect stopping is resumed once when Connect starts again.

  - The `turnStarted` Part carries `resumed: true`; `MessageSchema` is at v2, and v1 reads unchanged.
  - The Store's `lastRaw` is `lastTurn`.
  - Code shows "Resumed after Connect restarted".

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`139011f`](https://github.com/pkishorez/monorepo/commit/139011fe37d4cb1960fb30091f42308cf56e0dd2) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Two `ke-connect serve` of one Connection at once: only one signs in; the other says it is already running. A Device sign-in gives up as soon as its Auth Worker moves.

- [`b05ad32`](https://github.com/pkishorez/monorepo/commit/b05ad32c969f6f369b364f72eb50b9c42ae26eb0) Thanks [@pkishorez](https://github.com/pkishorez)! - `startSession` takes an optional `id`, a ULID chosen by the App so it knows the new Session before the answer comes. The Machine starts the Session under it; asked again with one of the same Project's, it starts nothing and answers with that Session as it is now, so a start asked twice never makes two. An id that is no ULID, or is another Project's Session's, is not used: the Machine chooses one, as it does without one.

## 0.0.4

### Patch Changes

- [#92](https://github.com/pkishorez/monorepo/pull/92) [`3bfd2c8`](https://github.com/pkishorez/monorepo/commit/3bfd2c82dfb21a7819b1c724cd1a32fb55092003) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Machine runs the agents installed on it, and keeps Harness Accounts: each agent's Default Account, and any other login the user adds, such as a second Claude for work.

  - Breaking: `harnessBinaries` and `setHarnessBinary` are `harnessAccounts`, `saveHarnessAccount` and `removeHarnessAccount`; an account has a name, a binary and a config folder.
  - Breaking: `harnesses` lists one entry per Harness Account: its `account` id, its `harness` (was `name`) and the account's `name` (was `label`); `startSession`, `models` and `skills` take `account` instead of `harness`, and `UnknownHarness` is `UnknownAccount`.
  - A Session runs, forks and is asked as the account it started with; Sessions stored before run as their harness's Default Account, and a Harness Binary set before is that account's.
  - A first `npx @kestack/connect` downloads about 650 MB less: no bundled Claude Code, Codex or speech runtime.

- [#91](https://github.com/pkishorez/monorepo/pull/91) [`2642a80`](https://github.com/pkishorez/monorepo/commit/2642a80efb0ca75b2f2698f739914525de95f98e) Thanks [@kishorenuma](https://github.com/kishorenuma)! - `pnpm dev` signs in with auth-toolkit's Fake everywhere, through the `kestack-fake-auth` export condition, and serves every backend on the site's own origin at `/rpc-<name>`, so one tunnel reaches the whole app; `pnpm dev:real` keeps the Auth Worker. A Fake Account's email must be at `kestack.test`, and `fakeGuard` makes the User from it again. The Web Platform fails any build that carries the Fake, and its `backend` gives a Worker's build the same switch.
- Updated dependencies [[`3bfd2c8`](https://github.com/pkishorez/monorepo/commit/3bfd2c82dfb21a7819b1c724cd1a32fb55092003), [`2642a80`](https://github.com/pkishorez/monorepo/commit/2642a80efb0ca75b2f2698f739914525de95f98e)]:
  - @kestack/ai-toolkit@0.0.4
  - @kestack/auth-toolkit@0.0.4
  - @kestack/rpc-toolkit@0.0.4
  - @kestack/std-toolkit@0.0.4
  - @kestack/kabuki@0.0.3

## 0.0.3

### Patch Changes

- [#88](https://github.com/pkishorez/monorepo/pull/88) [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - New package: Connect, the program on a computer that serves Code, and Cloud Connect, which lists a User's Machines.

  - `ke-connect serve` and `ke-connect logout` run and forget the Machine; its files live in XDG folders, moved once from `~/.ai-toolkit`.
  - Doors: `machine`, `code` (what Code's browser imports, over the `ke-connect` subprotocol), `worker` (Cloud Connect) and `dev`.
  - `dev` runs one Connect per branch, shared by every App's `pnpm dev`, and stops once the last App lets go.

- Updated dependencies [[`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1)]:
  - @kestack/ai-toolkit@0.0.3
  - @kestack/auth-toolkit@0.0.3
  - @kestack/kabuki@0.0.3
  - @kestack/rpc-toolkit@0.0.3
  - @kestack/std-toolkit@0.0.3
