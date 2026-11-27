# @kestack/devtools

Local DevTools server and app: Lotel for telemetry, Monoverse for monorepo architecture, and Kabuki for live Kabuki apps

## Big picture

Local development produces traces and logs, runs Kabuki apps, and grows a
folder structure that someone has to keep healthy. DevTools gives all of that
one place: `devtools` starts a loopback server that serves one browser app
and each Tool's endpoints.

The app is one client-rendered Kabuki app (`src/app`). Its root draws the
header and composes three Tools, each a plain Actor that starts from its
Input and draws everything below it, so any app can mount one on its own:
Lotel stores and shows OpenTelemetry data; Monoverse shows a Monorepo or a
Single Package as its folder tree, with the imports between folders and the
one rule they must keep; Kabuki lists the running Kabuki apps connected as
Kabuki Sessions and opens the Inspector on one, its eight calls answered by
that app's tab, through
[@kestack/devtools-kabuki](../devtools-kabuki/README.md). Each Tool's folder
holds its whole slice: its RPC contract, its server half and its Actors.
Applications send telemetry with
[@kestack/effect-tracer](../effect-tracer/README.md). An AI agent reaches
Lotel and Kabuki through the same server, as MCP tools at `/mcp`
([ADR 0014](./docs/adr/0014-devtools-serves-mcp-on-its-own-server.md)).

Terms are defined in [CONTEXT.md](./CONTEXT.md) and, per Tool, in
[docs/lotel.md](./docs/lotel.md) and [docs/monoverse.md](./docs/monoverse.md).
Decisions are in [docs/adr/](./docs/adr/); how the app is put together is
[ADR 0013](./docs/adr/0013-the-app-is-one-kabuki-tree-of-composable-tools.md).
The code holds no comments; what it cannot say for itself, such as limits set
by Vite, git or the browser, is in
[docs/implementation-notes.md](./docs/implementation-notes.md).

## Install

```sh
npm i -g @kestack/devtools
```

Or run it without installing: `npx @kestack/devtools`.

It has no peer dependencies.

## Exports

The package has no library subpaths: it ships the `devtools` binary only.

### CLI

| Command                             | What it does                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `devtools [--port] [--db] [--open]` | Runs the DevTools Server: the app, each Tool's RPC, OTLP ingestion and MCP on loopback. |

The server reads `DEVTOOLS_PORT` and `DEVTOOLS_DB` when the flags are absent;
it listens on `127.0.0.1:14400` by default.

## Usage

### Start the server and send telemetry to it

Run the server, then point an application's telemetry layer at it. Traces
and logs from every process land in one SQLite file.

```sh
devtools --open
# devtools running on http://127.0.0.1:14400
```

```ts
import { Effect, ManagedRuntime } from 'effect';
import { makeDevTelemetryLayer } from '@kestack/effect-tracer/telemetry/dev-telemetry';

// One runtime per process; each names its own service.
const server = ManagedRuntime.make(
  makeDevTelemetryLayer({
    endpoint: 'http://127.0.0.1:14400',
    serviceName: 'server:api-1',
  }),
);

await server.runPromise(
  Effect.log('order accepted').pipe(Effect.withSpan('handle-order')),
);

// Disposing drains the last batch.
await server.dispose();
```

How it works:

- The server listens on loopback only. `/`, `/lotel`, `/monoverse` and
  `/kabuki` are the app; `/health` lists every endpoint.
- Lotel answers `/rpc/lotel` and takes OTLP/HTTP JSON at `/v1/traces` and
  `/v1/logs`, from any origin; `makeDevTelemetryLayer` posts there.
- Monoverse answers `/rpc/monoverse`. Its Project registry and Lotel's
  Telemetry Store keep separate tables in the one DevTools database.
- Kabuki apps dial the WebSocket `/kabuki/connect` as Kabuki Sessions, from
  any origin. `/kabuki/sessions` and `/kabuki/session/:name` list them and
  pass one's eight calls to its tab, and answer only a request with no
  `Origin` or DevTools' own
  ([@kestack/devtools-kabuki](../devtools-kabuki/README.md)).
- `/mcp` is one MCP server over Streamable HTTP, for an AI agent; see
  below.

### Explore a repository's folder tree

Open `/monoverse`, pick a Project or open a folder under home, and Monoverse
shows it as its folder tree. Its place is the address:
`?project=<entry id>&package=<folder>&branch=<name>&base=<name>&changes=1`.

```text
repo view     the real folders; each Package a row of two lines, its
              folder's name over its own name and version. Select a
              Package: arcs show what it uses and what uses it, the rest
              dims; a Package cycle is red. A Package with a
              monoverse.json shows its Violation count, or a quiet shield
              when it has none. Double-click it to go in.
package view  the Package's git-known files; outside its Source roots dimmed,
              or left out.
              Select a folder: its links to its siblings and to folders
              beside its ancestors. With a monoverse.json, an import its
              rules forbid is a Violation, in red, counted on each file
              and folder that holds one; the selection's count opens what
              `monoverse lint` says of each, at its line and column.
top left      two menus on one line: the project, to open another, and in
              a Monorepo the Package shown or All packages, to go straight
              to another Package or back to the repo view.
top of tree   one toggle, held there as the tree scrolls: every folder
              opened, or closed down to the top level; beside it, the tree
              reset to its default view (in a Monorepo, open down to its
              Packages), in the right panel on a wide screen. Beside a folder holding folders, one button
              opens or closes everything inside it; so does a right click
              on any folder. The tree scrolls like a page, centred, and
              sideways only when it is wider than the screen.
row, hover    one button at the end of every row, at any depth: with
              Changes on it opens what changed in it (a file's diff, a
              folder's or Package's changed files); with Changes off, the
              file or a folder's files, and a Package's changes. No need
              to select it first.
bottom bar    the selection, or the whole tree, and what to do with it:
              Open file, View changes or Browse files; a Package in the
              repo view has View changes beside Open package, which turns
              Changes on if it is off.
top right     Branch: whose files you see, read from its worktree, or from
              git when none has it checked out. Compare to: what changes
              are measured against, another branch or Uncommitted for only
              the work not committed yet. Changes: added green, modified
              yellow, deleted red, rolled up to folders. The sliders beside it:
              whether a Package's ignored files are drawn, and while
              Changes is on, whether the unchanged are shown, dimmed or
              hidden and whether the deleted are drawn. On a phone all of
              it is one settings sheet.
wide screen   from 1200px, no bar: the tree in the middle, a panel either
              side of it. Left: the project, the selection and what to do
              with it, and every Package under All packages, one click
              back to the repo view. Right: Branch, Compare to, Changes,
              what the tree draws, and Reset to default view. Nothing in them moves as the tree loads or
              changes.
```

How it works:

- The server answers facts, at a branch: the git-known files, and each
  Package's import graph over every source file, tests included, each
  import resolved as its check resolves it, tsconfig `paths` and
  package.json `imports` too. The browser builds the tree and rolls up
  connections, so a selection never waits on the server.
- A Package with a `monoverse.json` beside its `package.json` is checked
  on the server by [@kestack/monoverse](../monoverse/README.md), the engine
  `monoverse lint` runs, in a worker thread so the server keeps answering,
  and the counts are the CLI's: its `sourceRoots`
  and `ignore` say which files are checked, and each Violation carries
  the CLI's own message and place. An unused exception or a stale
  restriction is counted on the `monoverse.json`. Without one, or with one
  that cannot be read, the whole Package is its Source root and nothing is
  checked.
- Every branch is checked the same way, on disk: from the worktree that
  has it, or from a copy of its whole commit, symbolic links included,
  written once under the OS temp folder
  (`kestack-devtools/monoverse/<commit>`), with the checkout's
  `node_modules` linked in, and kept for later opens while whole; only
  the last few stay.
- View changes opens a folder, the root included, as a tree of its files
  beside one file's diff, drawn by the tree's settings, behind the same
  sliders; Browse files does the same with Changes off. One button folds
  every folder to the top level or opens them all, and one beside a folder
  opens or folds everything inside it. ← and →, the bar
  under the file, or a swipe on it step from changed file to changed file;
  on a phone the list and the file are a screen each, a swipe apart, and a
  back arrow top left leaves the file, then the folder. Three buttons in a
  diff's header expand it, wrap it and lay it side by side; the browser
  keeps them.

### Give an AI agent Lotel and Kabuki over MCP

With the server running, an MCP client reaches it at `/mcp`. In this
repository `.mcp.json` names it, so Claude Code connects to it here with no
setup; elsewhere, add it once. The agent then reads the traces and logs
Lotel holds, and reads and drives any Kabuki app connected to DevTools, by
its Kabuki Session name.

```sh
claude mcp add --transport http devtools http://127.0.0.1:14400/mcp
```

```text
lotel_traces      the most recent Traces, newest first, each summed up
lotel_trace       one Trace's spans and logs, one plain record each, in ms
lotel_logs        the most recent logs from every process
kabuki_sessions   the live Kabuki Sessions: name, app and page
kabuki_look       the live Instances as a tree, one name each; those opened
                  with their Model and the Messages a person sends them
kabuki_timeline   where the app is, and its last 10 Messages (before: pages)
kabuki_send       a Message sent to an Instance, answered with what changed
kabuki_travel     the app shown at a Step, or back to now
kabuki_fork       every Message after a Step dropped, carrying on from it
kabuki_fakes      in fake mode, each Fake's state and its Controls
kabuki_control    a Control run on a Fake, answered with what changed
```

How it works:

- `/mcp` is `McpServer.layerHttp` from `effect/ai`, on the same loopback
  port. Every Tool's server registers its own Toolkit on it, so each tool
  reads the same Telemetry Store or Kabuki Session registry its RPC does.
  Monoverse registers none.
- A request with an `Origin` other than DevTools' own is refused, as for
  the RPC routes; an MCP client sends none.
- Every answer is small and plain, for a model to read: a payload is one
  line of TypeScript, `SignInAs { email: string; name: string }`, and a
  tool's output schema is only `object`. All 11 tools describe themselves
  in about 1,300 tokens; a look or a timeline answers in a few hundred.
  Long text, long lists and wide records in a Model or a Fake's state are
  cut, keeping a list's first 4 and last 8 items, and a store's own fields,
  `$…` and `_meta`, are left out.
- An Instance is named by its Actor, `Sidebar`; when that Actor has more
  than one, by its key, `Projects[computer-2]`, or under its parent,
  `Sidebar/Projects[computer-1]`. Every tool takes that name or the full
  address.
- There is no blueprint tool: `kabuki_look` gives each opened Instance the
  Messages its Actor takes in its State now, read from the Blueprint on
  the server. Only the Messages with a description are listed, as the ones
  a person sends; the others are counted as internal. An app that
  describes none has all of them listed.
- `kabuki_send` and `kabuki_control` wait until the app has been still for
  300 ms, at most 3 s, and answer with the Model fields the Message
  changed and the Instances that came, went or changed State, so an
  agent seldom needs a second look.
- `kabuki_timeline` and `kabuki_fakes` answer with what their stream says
  first, as a tool answers once. A tool's error, such as a Kabuki Session
  name no live one has, comes back as its result, with what is there
  instead.
