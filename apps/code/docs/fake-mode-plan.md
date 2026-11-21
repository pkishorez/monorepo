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
  `engine/services/file-system/` with the key, `node.ts` (node:fs) and
  `fake/` (a tree of entries over a std-toolkit table, one per computer).
  Folders and attachments (Disk) become real code over it. Controls: add a
  sample project (a git repo with branches and files), add a folder, make a
  folder unreadable / readable.
- **Git edge** stays (the git command). Its fake keeps state where git
  does, in the File System: `.git/HEAD`, `.git/refs/heads/*`, worktrees.
- **Harness sign-ins** (`binaryAt`, `checkBinary`, `configFolderOf`) go
  behind one key in ai-toolkit's harness; the real one under `/node`. The
  code Plugin's harness accounts take it from outside.
- **Agent**: one fake harness in `ai-toolkit/harness/fake`, playing Claude
  Code, Codex or both (data, not code): installed, signed in, accounts,
  models from the real catalog, the next reply from a Script. Scripts are
  recorded from real runs, at the Harness contract level.
- **Speech**: `ai-toolkit/speech/fake`: download fails, what a Take turns
  into.
- **Sign-in**: auth-toolkit keeps one Sign-in fake (`@kestack/auth-toolkit/fake`).
  Test Users go (the test sign-in form, `testUsers`, `isTestEmail`, the test
  label, `TEST_USERS_OFF`), and so do the `kestack-fake-auth` export
  condition and its doors, web-platform's `dev-auth`, Connect's fake dev
  sign-in, and `dev:real`. The production check stays, generalised: a
  production bundle carrying any fake fails.
- **Computers**: `@kestack/connect/fake`. The list of computers, whether
  each is online, and more as the checklist asks (an older `ke-connect`,
  another Release, an expired key). Each computer owns its File System fake.
  `@kestack/connect/browser` runs Connect Cloud and a code Plugin per online
  computer in the tab, and sends each online computer's heartbeat to the
  real Cloud handlers, as `ke-connect` would.
- **Code's own edges come from the root**: `Recorder` (built today inside
  the Voice Actor) and the socket opener (built today inside the Account
  Actor, `reach`) come from `start.tsx`'s Layer, like `Accounts` and
  `CloudClient`. Microphone fake beside the recorder (`recorder/fake/`),
  New build fake beside web-platform's PWA (`pwa/fake/`).
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
5. **connect, File System fake.** The tree over a table, its Actor and
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

| Task | Status | Commit | Notes    |
| ---- | ------ | ------ | -------- |
| 0    | done   |        | this doc |
