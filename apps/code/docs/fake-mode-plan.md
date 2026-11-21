# Plan: fake mode, Code whole in a browser tab

Branch `feat/fake-mode`, on `refactor/connect-simple-tree` (`bb771d3e3`).
Worktree: `/home/kishore/.local/share/kestack/code/worktrees/01M6N3EF34AF0HNPQ9FKYDX7W6/01m7zgrjwjb2eax2ntgpqxzk8c`.

Goal: `pnpm --filter code dev` opens Code with nothing behind it. All the
code that can run in a browser runs for real, in the tab; only what truly
lives outside a browser is faked, and a bubble on the page controls the
fakes. The litmus test: everything Code can do in production can be done in
fake mode, bar what a browser cannot do, listed.

## The model

- **Middle**: the real code. Code's Actors, Connect Cloud's handlers, the
  code Plugin's handlers and Engine, ai-toolkit's projections. Unchanged; in
  fake mode it runs in the tab, served to Code through rpc-toolkit's
  In-Process Transport.
- **Driver**: a swap with nothing to control. Tables: SQLite or D1 for real,
  memory or IndexedDB in the tab. Transport: websocket or HTTP for real,
  in-process in the tab.
- **Edge**: what only the outside world has: a process, a disk, git, a
  device, a third-party server. A Service key, browser-safe, with a real
  version (Node-only code behind a `/node` door) and a fake.
- **Fake**: one thing in the outside world a person would name. A plain
  object `{ name, actor, controls, serve }`: a Kabuki Actor that Requires
  nothing and starts blank, the Messages the bubble offers (`controls`), and
  `serve` (the running Actor → the Layer of its edges). A Fake imports
  nothing from devtools-kabuki, so no package cycle: devtools-kabuki only
  runs Fakes and draws the bubble.
- **Fake World**: the flat list of Fakes an app picks. Runs each, gives one
  Layer of every edge, draws the bubble.

## Rules

1. Fake the edges, run the middle. Never write the middle twice.
2. The middle takes its edges from outside; a `node.ts` beside it composes
   the real ones. Edge keys live in browser-safe files; Node-only code sits
   under a `/node` door.
3. A fake lives beside the service it fakes, in a `fake/` folder, exported
   as `<package>/<service>/fake`. Fix it once, every app has the fix.
4. Few Fakes, human-sized. A Fake knows only its own state; Fakes never call
   each other. A Fake may own child Fakes (a computer owns its File System).
   A fake edge may use another edge's key (fake Git reads the File System).
5. `serve` is thin: it reads the Model, shapes answers, picks the edge's
   errors; every change is a Message it sends.
6. A Control always lands; the app decides whether it notices. Fakes start
   blank; Controls make the world.
7. Two modes only: **real** (production, real sign-in; deployed or local)
   and **fake** (everything in the tab). Fake code is imported lazily and a
   production build refuses any bundle carrying it.

## Decisions settled

- **File System edge** in connect, beside Folders:
  `engine/services/file-system/` with the key (in `engine/capabilities/`),
  `node.ts` (node:fs) and `fake/`, one per computer. The fake's tree is
  its Actor's Model, entries by path (no table): its Snapshot is the disk,
  so a reload keeps it (task 20). Folders and attachments (Disk) become
  real code over it. Controls: add a
  sample project (a git repo with branches and files), add a folder (a
  hidden one, many at once to pass the 100 a listing holds), make a
  folder unreadable / readable, make a folder fail to list (`FolderUnreadable`),
  remove or move a folder and put it back (a Project's folder missing),
  add a symlink (inside home, or pointing outside it).
- **Git edge** stays (the git command). Its fake keeps state where git
  does, in the File System: `.git/HEAD`, `.git/config`, `.git/refs/heads/*`,
  `.git/refs/remotes/origin/*`, worktrees; Origin a bare repository outside
  home (`/srv/origin<repo>.git`) that a fetch copies from; git missing and
  the next step failing as files under `/.fake/git/`. The layout is in
  `file-system/fake/git.ts`.
  Its Controls are the File System Fake's, as its state is: switch a
  repo's branch outside Code, add a local or an Origin branch (seen after
  the next fetch), push a branch (so its `ke-code/<slug>` rename is
  skipped), make the next git step fail (`GitFailed`), git missing.
- **Harness sign-ins** (`binaryAt`, `checkBinary`, `configFolderOf`) go
  behind one key in ai-toolkit's harness; the real one under `/node`. The
  code Plugin's harness accounts take it from outside.
- **Agent**: one fake harness in `ai-toolkit/harness/fake`, playing Claude
  Code, Codex or both (data, not code): installed, signed in, accounts,
  models from the real catalog, the next reply from a Script. Scripts are
  recorded from real runs, at the Harness contract level. Controls the
  checklist adds: not installed (with its reason), not signed in (Turns
  fail with the harness's login error, models fall back to models.dev),
  which binary paths run (`InvalidBinary` on save), a config folder from
  the computer's environment (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`), models
  fail, Skills per folder or failing, fails to open (`HarnessFailed` on
  start), hang until stopped, a Title (and its regeneration failing), a Btw
  answer or `AskFailed`, context usage and plan limits, a Turn the agent
  starts on its own, a Background Job's output and end (done, failed),
  stopping a job fails, a question answered elsewhere, answering fails.
- **Speech**: `ai-toolkit/speech/fake`: download fails, what a Take turns
  into; and download progress, words heard as it goes, nothing heard,
  transcription fails, stops answering (a Take timing out).
- **Sign-in**: auth-toolkit keeps one Sign-in fake (`@kestack/auth-toolkit/fake`).
  Test Users go (the test sign-in form, `testUsers`, `isTestEmail`, the test
  label, `TEST_USERS_OFF`), and so do the `kestack-fake-auth` export
  condition and its doors, web-platform's `dev-auth`, Connect's fake dev
  sign-in, and `dev:real`. The production check stays, generalised: a
  production bundle carrying any fake fails. Controls: sign in as (or
  cancel), sign-in fails, sign out / switch / add an Account from another
  tab, Auth Worker out of reach (slow, then answering another).
- **Computers**: `@kestack/connect/fake`. The list of computers, whether
  each is online, and more as the checklist asks. Each computer owns its File System fake.
  `@kestack/connect/browser` runs Connect Cloud and a code Plugin per online
  computer in the tab, and sends each online computer's heartbeat to the
  real Cloud handlers, as `ke-connect` would. Controls: add a computer
  (Computer Name, `ke-connect` version) and remove it; online / offline,
  with its last seen pushed back so it is Down at once; tunnel state
  (SettingUp: Downloading with progress, Opening, Failed; Ready: Unchecked,
  Reachable, Unreachable with a problem); tunnel moves to a new address;
  key rotates (`KEY_EXPIRED`); update `ke-connect`; runs another Release of
  the code Plugin (`PLUGIN_MISMATCH`); restart (a running Turn ends
  interrupted and is Resumed, jobs and Takes are cut off); forgets itself
  (Heartbeat `Forget`); and a Forget from Code must stop it
  (`ConnectionForgotten`). Connect Cloud's own: out of reach / back, the
  Minimum Connect, the code Plugin's wanted Release (this Code's, another,
  or one it has never heard of), forget or rename a computer as from
  another device; and another device acts (starts a Session, settles one,
  answers a question), a client of the in-tab code Plugin.
- **Code's own edges come from the root**: `Recorder` (built today inside
  the Voice Actor) and the socket opener (built today inside the Account
  Actor, `reach`) come from `start.tsx`'s Layer, like `Accounts` and
  `CloudClient`. Microphone fake beside the recorder (`recorder/fake/`),
  New build fake beside web-platform's PWA (`pwa/fake/`). Microphone
  Controls: inputs (add, remove or unplug, the system default), permission
  (prompt, allowed, denied), slow to open, broken, blocked (as iOS Safari),
  loud or silent. New build Controls: a newer build out or none; moving to
  the newest build (`OnOutdated`, Code Stale) must end the Stale world, or
  each load reloads again.
- **A reload keeps the world**: in fake mode the tables are on IndexedDB,
  and the Fake World saves each Fake's Snapshot on change and starts from it
  (`Runtime.make({ snapshot })`). A reply running at reload ends interrupted,
  as on a real computer's restart.
- **Start fresh**: a bubble button sets a flag and reloads; on the next
  start, before anything opens, every IndexedDB database, localStorage and
  sessionStorage is deleted.
- **Kabuki DevTools** keep working: History, Seek and Fork on Code's
  Runtime as today. Seek rewinds Code only; the fakes and the in-tab middle
  keep their state, as a real server does.
- **One tab.** Fake mode runs one world per tab; a second tab would run a
  second middle over the same IndexedDB. Cross-tab flows go through the
  Sign-in fake's "from another tab" Controls. Listed as a limit.
- **"Code is behind" never outlives a reload.** Controls that make Code the
  older side (a computer on another Release, Connect Cloud wanting another
  Release) are not kept in the saved Snapshot, so moving to the newest build
  ends them instead of reloading forever.
- **"Another device acts"** (answer a question, start or settle a session,
  rename or forget a computer elsewhere) is a Control on the Computers fake
  that calls the in-tab middle's public contract as a second client (rule
  4), never another Fake.

## The shape of a Fake

Every Fake has the same shape, so the Fake World (task 11) runs any of
them, and none imports devtools-kabuki:

```ts
// <service>/fake/index.ts
export const fileSystem = {
  name: 'File System',
  actor: FileSystemFakeLive, // a built Kabuki Actor; Requires nothing; starts blank
  controls: ['AddSampleProject', 'AddFolder', 'MakeUnreadable'] as const, // its Message tags the bubble offers
  serve: (runtime) => fileSystemOver(handleOf(runtime)), // Runtime<actor> → Layer<edge keys>
};
```

- `serve` takes the Fake's running Kabuki `Runtime` (its `root` Instance,
  `snapshot`, `changes`, `send`).
- A Fake that can also be a child of another (a computer's File System)
  exports the layer-maker under it, over a small handle (read the Model
  now, follow its changes, send a Message), so the parent's `serve` builds
  each child's edges from the child Instance.
- Messages that are Controls are written in plain words a person would use;
  their Schemas give the bubble its forms, so each field has a clear name.

## Where things live

| What                                      | Where                                                         |
| ----------------------------------------- | ------------------------------------------------------------- |
| Fake World, the bubble                    | `@kestack/devtools-kabuki/fake`                               |
| Sign-in fake                              | `toolkits/auth-toolkit/src/guard/fake/`                       |
| Agent fake, harness sign-ins key          | `toolkits/ai-toolkit/src/harness/fake/`, `harness/`           |
| Speech fake                               | `toolkits/ai-toolkit/src/speech/fake/`                        |
| File System, Git (key, real, fake)        | `apps/connect/src/connection/plugins/code/engine/services/`   |
| The middle in the tab, the Computers fake | `@kestack/connect/browser`, `@kestack/connect/fake`           |
| New build fake                            | `platforms/web-platform/src/pwa/fake/`                        |
| Microphone fake                           | `apps/code/src/app/account/frame/header/voice/recorder/fake/` |
| Code's Fake World                         | `apps/code/src/fake.ts`                                       |

## The spike

On this branch the real Engine, `CodeApiLive`, `CodeReplicaLive` and Connect
Cloud's `appHandlers` and `heartbeatHandlers` ran in headless Chromium over
memory tables, the fake harness and stand-in edges: a session started and
streamed, a heartbeat made a Connection reachable, an IndexedDB table
survived a reload. A browser bundle went from 88 Node imports to none.

Its diff, 61 files, is kept outside the repo and applies cleanly to
`bb771d3e3`: `~/.local/share/kestack/spikes/fake-mode-connect-tree.patch`.
Take a part with `git apply --include='<path>/*' <patch>` and adapt it to
this plan (it predates the File System edge and the harness sign-ins key,
and puts `AccountHost` in connect). `apps/connect/spike/` in it is
throwaway, but `spike/bundle.mjs` shows the no-Node bundle check and
`spike/world.ts` the in-tab wiring. It skips the Laymos Rules; new files
must go through their `index.ts`.

Gotcha: build the in-process client Layer in a long-lived Scope. Provided
into `versionedClient` with `Effect.provide`, it closes at once and later
calls die with "All fibers interrupted". rpc-toolkit's in-process transport
gives only `RpcClient.Protocol`; `RpcConnection` must be given as always
connected.

## Working rules, for every task

- One sub-agent at a time; nothing in parallel.
- The machine runs out of memory easily. Never run the root `pnpm build`,
  `pnpm test` or `pnpm lint`. Run only the touched package's own scripts,
  one at a time (`pnpm --filter <pkg> test|lint|build`). Vitest with at most
  2 workers. No watch modes; no dev server or browser left running; at most
  one headless browser. Build an upstream package only when a downstream
  one needs its `dist`.
- Follow the repo's `CLAUDE.md`, the package's `README.md`/`CONTEXT.md`,
  the Laymos Rules (`laymos lint`), and the style of the code around.
  README changes follow `docs/readme-conventions.md`.
- A published package changed gets a `patch` changeset in `.changeset/`;
  never name `code`.
- End green: the touched packages' `test` and `lint`.
- One commit per task on `feat/fake-mode`, Conventional Commits as in
  `git log`, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
  The commit includes this doc's Progress row for the task.

## Tasks

0. **Plan.** This doc.
1. **Checklist.** Everything Code does in production, from its pages,
   Actors, commands and the code Plugin's RPCs, written to
   `apps/code/docs/fake-mode-checklist.md`: each flow, how to reach it, the
   Fake and Control it needs. Controls the plan lacks are added to the
   Fakes' lists here.
2. **ai-toolkit, browser-safe doors.** `/harness` and `/speech` hold only
   browser-safe code; `/harness/node`, `/speech/node` hold Claude, Codex,
   the catalog's file reads, sherpa. `Models`, `Speech` keys apart from
   their Layers; `failure.ts` without `node:path`.
3. **ai-toolkit, harness sign-ins.** One key over `binaryAt`,
   `checkBinary`, `configFolderOf`; the real one under `/harness/node`.
4. **connect, File System edge.** The key and `node.ts`.
5. **connect, File System fake.** The tree in its Actor's Model, its
   Controls, as a Fake.
6. **connect, the Engine takes its edges.** Store over a table
   (`storeOver(table)`), Git, harness sign-ins, File System from outside;
   pure path helpers; `engine/node.ts` composes the real ones; `serve/`
   uses it.
7. **connect, Folders and attachments on the File System.**
8. **connect, Git fake** over the File System.
9. **connect, `/browser`.** Connect Cloud over tables behind the Sign-in
   fake's guard; a code Plugin per online computer, started on first use,
   shared by every socket; in-process clients in the caller's Scope; the
   heartbeat. A test bundles the door for the browser and fails on any Node
   import.
10. **connect, `/fake`.** The Computers fake.
11. **devtools-kabuki, Fake World.** `./fake`: runs the Fakes
    (`Runtime.scoped`), merges their Layers, exposes their Runtimes.
12. **devtools-kabuki, the bubble.** Movable, opens to the Fakes, each with
    its Model, a form per Control from the Blueprint's Message Schemas, a
    log of who sent what.
13. **auth-toolkit, Sign-in fake.** As a Fake (sign in as…, sign out from
    another tab, switch from another tab); Test Users removed.
14. **One fake mode.** The export condition, its doors, `dev-auth`,
    Connect's fake dev sign-in and `dev:real` removed; the production check
    refuses any fake.
15. **code, edges from the root.** `Recorder` and the socket opener from
    `start.tsx`'s Layer; real mode unchanged.
16. **code, fake mode.** `pnpm dev` is fake mode; `start.tsx` imports
    `src/fake.ts` lazily; Microphone and New build fakes. Done when the app
    opens, signs in and shows no Connection.
17. **Computers end to end.** Home, the Project Picker over the file tree,
    Settings, offline and back.
18. **Agent fake.** Claude and Codex, accounts, models, Scripts of real
    records (words, each tool, a subagent, a question, a Background Job;
    each ending done, failed or cut off), the Controls.
19. **Speech fake.** Dictation end to end.
20. **A reload keeps the world; Start fresh.**
21. **DevTools in fake mode.** History, Seek, Fork.
22. **The checklist walk.** Every flow in `fake-mode-checklist.md`, in the
    browser; fixes as more tasks; browser-only limits listed.
23. **Guidelines.** `docs/fakes.md` from the Model and Rules; their words in
    the root `CONTEXT.md`; changesets checked.
24. **Recorded run.** The app in Chromium, every scenario of the checklist
    driven through the app and the bubble, recorded on video.

## Progress

| Task | Status | Commit      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | done   |             | this doc                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 1    | done   |             | `fake-mode-checklist.md`, 13 areas; Controls added above; open: two tabs run two middles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2    | done   | `5c54839f6` | Node code under `/harness/node`, `/speech/node`; `Models.layer` → `modelsLayer`, `Speech.layer` → `speechLayer`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 3    | done   |             | `HarnessHost` key in `/harness`, `harnessHostLayer` in `/harness/node`; connect still calls the functions (Task 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 4    | done   | `e424a418e` | `FileSystem` key in `engine/capabilities/`, `nodeFileSystem` in `services/file-system/`; nothing uses it yet (Task 7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 5    | done   |             | `fileSystem` from `file-system/fake/`; tree in the Model; git layout and `/.fake/git/` switches in `fake/git.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 6    | done   |             | `EngineEdges`: Store, Harnesses, OneShotPrompt, Git, FileSystem, Folders, HarnessHost; `engine/node.ts` (a File Module): `storeLayer`, `nodeEdges({ home })`; `storeOver(table)`, `aiTable`; only Folders still Node (Task 7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 7    | done   | `db595f891` | Folders run inside `Engine.layer` (`homeFolders` over `FileSystem`); `EngineEdges`: Store, Harnesses, OneShotPrompt, Git, FileSystem, HarnessHost; home is the File System's (`nodeFileSystem({ home })`); `paths` adds `dirname`, `isWithin`; attachments were already on it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 8    | done   |             | `fakeGit` (`services/git/fake/`): `Layer<Git, never, FileSystem>`, scoped (a fetch forks in it), no Actor; per computer `fakeGit.pipe(Layer.provide(fileSystemOver(handle)))`; fail-next is taken by switchTo, addWorktree, rename only (not fetch or questions); a Worktree copies the main one's files; tests run the Engine over both fakes (`engine/tests/fakes.test.ts`, with node `harnessHostLayer`: no HarnessHost fake yet)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 9    | done   |             | `@kestack/connect/browser` (`src/browser/`): `inTab(options)`: `Layer<CloudClient \| Tunnels, never, Computers>`; `tunnelClients`: `Layer<CodeClients, never, ConnectionAddress \| Tunnels>`. Sockets are in-memory WebSockets (`sockets.ts`) dialled through rpc-toolkit's new `dial` option (`CodeClients.dialing(dial)`), not the in-process transport: Effect RPC's real socket protocol runs on both ends, so reconnects, `watch`, `KEY_EXPIRED` and `PLUGIN_MISMATCH` (answered as ke-connect's server.ts does, `tunnel.ts`) are Code's own code paths. Cloud: real handlers over `tables(connectionsTable, 'connect-cloud')`, App API behind `fakeGuard.rpc()` (reads the token Code's `fakeAccounts` signs with), each computer's Heartbeat behind `fakeGuard.rpc({ as: fakeSignIn(email, 'ke-connect <id>') })` (new in auth-toolkit), sent through ke-connect's own `cloud()` client every 15 s and at once on a change; below `minConnect` it fails `Outdated` as worker.ts's 426. A Run per online computer (`runs.ts`), keyed by id and `startedAt`; its code Plugin starts on the first socket passed, Store on `tables(aiTable, 'code-plugin <id>')` (kept across restarts). Handlers moved to `serve/handlers/` (browser-safe). Bundle test: rolldown (`vite/rolldown`), 507 modules, no Node import. **Task 10**: serve `Computers` (`changes`: the whole list now and on each change; `stopped(id, why)`: Forgotten, SignedOut, Outdated, Taken; the Run stays stopped until offline and back or a new `startedAt`). Controls map to fields: restart = new `startedAt`, key rotates = `key`, tunnel moves or breaks = `status` (dialable only while Ready and not Unreachable; sockets at the old host drop), runs another Release = `release` (64 hex), update = `version`. `email` must be the signed-in Account's, at kestack.test. Not in the middle yet: last seen pushed back, forgets itself (Heartbeat `Forget`), Connect Cloud's own Controls (`wanted`, `minConnect`, `files` are fixed options; `appHandlers` reads `latest` per call); another device is `CodeClients.dialing(tunnels.dial)` with its own `ConnectionAddress`. No HarnessHost or Models fake: `src/browser/tests/browser.test.ts` stubs them. **Tasks 15–16**: fake mode's root Layer swaps `CloudClient.layer(url)` for `inTab({ wanted: { code: { hash: PLUGIN_CODE, url } } })` with `fakeAccounts` provided below it (`provideMerge`) and `Computers` from the Fake World; without `wanted` every socket closes `PLUGIN_MISMATCH`. The socket opener is `Sockets.from(tunnelClients.pipe(Layer.provide(addressAt(PLUGIN_CODE))))` (Tunnels from the root), real mode keeps `CodeClients.layer`. Open: the code Plugin's build changed and is not released (as in tasks 6–8). |
| 10   | done   |             | `computers` from `@kestack/connect/fake` (`src/browser/fake/`, Laymos rule `src/browser/fake` → `src/browser/computers`): `{ name, actor: ComputersFake, controls, serve, kept }`. `controls` spans three Actors, their tags all distinct: the root's (add a computer; Connect Cloud out of reach / back, Minimum Connect, names this App's / a newer / an older Release), each computer's, each File System's; the bubble offers on an Instance the ones its Actor has. Root Model: `computers` (each Child's input: id `computer-N`, never reused; name; email, blank `you@kestack.test`; version, blank `1.0.0`), `added`, `cloud` (`reachable`, `minConnect`), `untilReload.cloudRelease`. A computer (keyed Child `computers`, owning `fileSystem`): `online`, `silentFor`, `removed`, `starts` (= `startedAt`), `keys` (key `fake-key-<id>-<n>`), `moves` (tunnel `https://<id>[-<moves>].computers.fake`), `tunnel` (Downloading, Opening, Failed, Unchecked, Reachable, Unreachable; serve stamps each `at` as it first sees it), `stopped` (what `Computers.stopped` said, cleared by Restart, ComeOnline, UpdateKeConnect, which also restarts), `untilReload.runsAnotherRelease` (`ANOTHER_RELEASE`), `elsewhere` (acts queued), `saidElsewhere`. `serve` builds each computer's File System and Git once per Instance in a Scope of its own, and tells the list again only when it says something new. **Task 9 corrected**: `Computer.edges` is `FileSystem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Git`; `inTab`requires`Computers | ConnectCloud | AgentEdges`(Harnesses, OneShotPrompt, HarnessHost, Models, Speech, shared by every code Plugin; tests:`src/browser/tests/agent.ts`). `ConnectCloud` (`{ reachable, minConnect, release }`, `ConnectCloud.deployed`) is read per call: out of reach every App and Heartbeat call fails `RpcClientError`(HttpError TransportError), a Newer Release keeps the App's file (Standing Older), an Older one does not (Unknown);`minConnect`null keeps inTab's.`Computer`gains`silentFor`(Last Seen set back once as it goes offline,`pushBack`on the row: Down at once) and`removed`(Heartbeat Forget once online, then nothing runs). **Another device**:`Computers.anotherDevice(device)`; inTab hands the fake `{ cloud, code }` once built (`CodeClients.dialing(dial)`at`wanted.code.hash`, address from `List`); acts queue in the Model, serve carries each out (`elsewhere.ts`) and Sends `ActedElsewhere`. Rename, forget, start, settle and answer a question (first choice per Item) all done and tested. **Task 11**: a Fake may carry `kept(snapshot)`; `serve` needs a Scope (`Layer.effectContext`). **Tasks 15–16**: root Layer `inTab({ wanted: { code: { hash: PLUGIN_CODE, url } }, minConnect })`, provided `computers.serve(runtime)`and the Agent's and Speech's Layers (stub HarnessHost, Models, Speech as`agent.ts`does until tasks 18–19),`fakeAccounts` below it (`provideMerge`). A computer is listed only to the Account its email names. **Task 17**: AddComputer, then its File System's AddSampleProject. **Task 20**: save `computers.kept(snapshot)`, so `untilReload`(Releases) starts blank; acts still queued are carried out after the reload;`stopped` is kept, though the middle starts every online computer again, so a forgotten one is refused and stops again. |
