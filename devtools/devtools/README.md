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
Kabuki Sessions and opens the Inspector on one, through
[@kestack/devtools-kabuki](../devtools-kabuki/README.md). Each Tool's folder
holds its whole slice: its RPC contract, its server half and its Actors.
Applications send telemetry with
[@kestack/effect-tracer](../effect-tracer/README.md).

Terms are defined in [CONTEXT.md](./CONTEXT.md) and, per Tool, in
[docs/lotel.md](./docs/lotel.md) and [docs/monoverse.md](./docs/monoverse.md).
Decisions are in [docs/adr/](./docs/adr/); how the app is put together is
[ADR 0013](./docs/adr/0013-the-app-is-one-kabuki-tree-of-composable-tools.md).

## Install

```sh
npm i -g @kestack/devtools
```

Or run it without installing: `npx @kestack/devtools`.

It has no peer dependencies.

## Exports

The package has no library subpaths: it ships the `devtools` binary only.

### CLI

| Command                             | What it does                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `devtools [--port] [--db] [--open]` | Runs the DevTools Server: the app, each Tool's RPC, and OTLP ingestion on loopback. |

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
  forward one's Kabuki Session Api, and answer only a request with no
  `Origin` or DevTools' own
  ([@kestack/devtools-kabuki](../devtools-kabuki/README.md)).

### Explore a repository's folder tree

Open `/monoverse`, pick a Project or open a folder under home, and Monoverse
shows it as its folder tree. Its place is the address:
`?project=<entry id>&package=<folder>&branch=<name>&base=<name>&changes=1`.

```text
repo view     the real folders; each Package a row of two lines, its
              folder's name over its own name and version. Select a
              Package: arcs show what it uses and what uses it, the rest
              dims; a Package cycle is red. Double-click it to go in.
package view  the Package's git-known files; outside its Source roots dimmed,
              or left out.
              Select a folder: its links to its siblings and to folders
              beside its ancestors; a file reaching up into an ancestor
              folder's own files is a Violation, in red.
top left      two menus on one line: the project, to open another, and in
              a Monorepo the Package shown or All packages, to go straight
              to another Package or back to the repo view.
corner        every folder opened or closed down to the top level, zoom,
              and back to the top; beside a folder holding folders, one
              button opens or closes everything inside it. On a phone the
              tree scrolls like a page.
bottom bar    the selection, or the whole tree, and what to do with it:
              Open file, View changes or Browse files; a Package in the
              repo view has View changes beside Open package, which turns
              Changes on if it is off.
top right     Branch: whose files you see, read from its worktree, or from
              git when none has it checked out. Compare to: what changes
              are measured against. Changes: added green, modified yellow,
              deleted red, rolled up to folders. The sliders beside it:
              whether a Package's ignored files are drawn, and while
              Changes is on, whether the unchanged are shown, dimmed or
              hidden and whether the deleted are drawn. On a phone all of
              it is one settings sheet.
```

How it works:

- The server answers raw facts only, at a branch: the git-known files, each
  Package's Source roots and its import graph, read with oxc. The browser builds the
  tree, rolls up connections and applies the rule, so a selection never
  waits on the server.
- Source roots come from `sourceRoots` in a `laymos.config.json` beside a
  Package's `package.json`; nothing else in it is read. Without one, the
  whole Package is its one Source root.
- View changes opens a folder, the root included, as a tree of its files
  beside one file's diff, drawn by the canvas's settings, behind the same
  sliders; Browse files does the same with Changes off. One button folds
  every folder to the top level or opens them all, and one beside a folder
  opens or folds everything inside it. ← and →, the bar
  under the file, or a swipe on it step from changed file to changed file;
  on a phone the list and the file are a screen each, a swipe apart, and a
  back arrow top left leaves the file, then the folder. Three buttons in a
  diff's header expand it, wrap it and lay it side by side; the browser
  keeps them.
