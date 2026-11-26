# The harness contract

Every harness folder in `src/` follows this page. A harness is one Coding
Harness (Claude Code, Codex, OpenCode, Antigravity, any ACP agent) offered as
one Effect `Context.Service`, typed in that harness's own words. Nothing is
shared between harness folders: no common types, no shared helpers, no
imports across them. Each folder could be lifted out as its own package.

## Principles

1. **True to the harness.** Records, requests, answers, options and ids are
   the harness's own types (the SDK's, or the protocol's), never translated
   into a common shape. A harness that cannot do something does not have the
   method; nothing is faked to look uniform.
2. **Stateless calls.** Every method takes everything it needs (cwd,
   options, ids). The only state is the router of live instances.
3. **Minimal, never limiting.** Few methods, but nothing the harness offers
   is out of reach: options take the harness's own option type (minus the
   few fields the toolkit itself must own, such as the input stream), and
   each harness that has a raw channel exposes it (see "Escape hatch").
4. **The native id is the only id.** The caller never invents a second one.
5. **A fake for every harness**, at the Service level, so an app can run
   without the real binary.

## The Service

Named for the harness: `Claude`, `Codex`, `OpenCode`, `Antigravity`,
keyed `'@kestack/ai-toolkit-v2/<Name>'`. ACP is the exception: any number of
agents speak it, so its `contract/` exports the Service's type, `AcpAgent`,
and the app declares one plain `Context.Service` per agent; `real/` and
`fake/` give `make(options)` for the Service value and `layer(tag, options)`
for a Layer of that tag. Session verbs, where the harness can do them:

| Method                           | Returns                          | Meaning                                                           |
| -------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `create(input)`                  | `Stream<Out, Error>`             | A new session and its first Run. First element `Started`.         |
| `fork(input)`                    | `Stream<Out, Error>`             | A new session from another's point, and its first Run.            |
| `send(input)`                    | `Stream<Out, Error>`             | A Run on an existing session: routed to the live one, or resumed. |
| `respond(id, requestId, answer)` | `Effect<void, NotLive \| Error>` | Answer a pending request (permission, question, elicitation).     |
| `cancel(id)`                     | `Effect<void, NotLive>`          | Stop the Run in progress.                                         |
| `watch(id)`                      | `Stream<Live>`                   | The live instance as it changes; ends when it goes.               |
| `live`                           | `Effect<ReadonlyArray<Live>>`    | Every live instance now.                                          |

`send` takes `mode: 'queue' | 'steer'` where the harness steers (default
`queue`); a harness that cannot steer has no `mode`. `queue` waits behind the
Run in progress. `steer` joins it, ahead of anything queued, and streams the
Run it joined, from its start, with `Steered` where the agent took it. With
no Run in progress, live or not, `steer` is `queue`. Joining uses only the
message; the input's other options apply only when it becomes its own Run.

Then **harness-specific methods**: everything else the harness can answer,
investigated per harness and added when real: context usage, rate limits or
subscription, account, models, MCP status, skills or commands, listing or
reading past sessions, compaction, and so on. Each takes what it needs per
call. A method that needs the live process takes the session id and fails
`NotLive` when there is none; one that does not starts what it needs and
lets it go.

### `Out`

A tagged union per harness, always in this order for one Run:

- `Started { id }`: the native id. First on `create` and `fork`; on `send`
  too, for symmetry. Sent as soon as the harness says it.
- `Queued { position }`: only when `send` arrived while a Run was in
  progress; the stream waits until its Run starts.
- `Record { record }`: one native record, unchanged.
- `Requested { request }`: the harness asks the caller (native shape), to be
  answered with `respond`.
- `Steered { message }` on a Run a steering `send` joined: the steer's own
  record where the harness echoes one, at the place the agent took it.
- `Ended { status, at?, result?, error? }`: always last. `status` is
  `completed | cancelled | failed`. `at` is the fork point this Run ended
  on, in the harness's terms. `result` is the final result the harness
  gives (structured output included).

### `Live`

`{ id, status: 'starting' | 'running' | 'ready', queue: number, requests:
ReadonlyArray<native request>, … }`, plus whatever else the harness knows
live.

### Errors

`NotLive { id }` and one `<Name>Error { message, cause? }` per harness, as
`Data.TaggedError`s exported from the harness's `contract/`.

## Routing and streaming rules

1. **One live instance per native id.** `send` goes to it, or starts one
   that resumes the id. `respond` and `cancel` fail `NotLive` when there is
   none.
2. **The router keeps instances alive while used.** A Run, or a `watch`
   reader, holds its instance; after the last lets go it lingers for
   `linger` (`layer` option, default 30 seconds), then its process stops.
   Effect's `RcMap` if it fits, else a small map in a `SynchronizedRef`.
3. **`send` during a Run queues** (`Queued`), in order, unless it steers.
4. **A Run belongs to its instance, not its reader.** A reader that stops
   reading does not cancel the Run; only `cancel` does. Each reader gets
   every element of its Run from the start, however late it subscribes.
5. **`Ended` is always last.** A harness failure is `Ended { failed }`. The
   stream fails with `<Name>Error` only when the process cannot start or the
   request is refused before any Run.
6. **The process dies mid-Run**: `Ended { failed }`, pending requests drop,
   the instance is gone; the next `send` resumes.
7. **The current Run's elements are kept until it ends**, never longer.
8. **Nothing is stored.** The toolkit writes no files of its own.

## Background work

The harness's own background jobs are switched off where a switch exists
(they would die when the instance stops). Record in your README which
switch you used, or that none exists.

## Escape hatch

Where the harness has a raw channel, expose it, typed as the harness types
it: Claude's whole SDK `Options`, Codex's raw JSON-RPC `request` on a live
thread, OpenCode's SDK client, ACP's connection. Name it plainly
(`options`, `request`, `client`).

## Folder

Each harness is one Service: its contract, a real implementation and a fake
one. `monoverse.json` makes `contract/` and `shared/` the only doors, each
open only inside the harness folder that holds it, so harnesses cannot
import each other; and it checks every `contract/`: it exports the Service
tag and error classes as values, everything else as types.

```
src/<harness>/
├── README.md        the five-section README for this harness's subpaths
├── contract/        door: the Service tag, its errors; Out, Live, inputs as types only
├── shared/          door: the router and live instance, over a Driver; the Driver tag;
│                    Out's constructors; what real/ and fake/ both run
├── real/            layer(options): the shared router over the real driver
├── fake/            layer(options), recordings: the shared router over a recording driver
│   └── recordings/  nested module: the recorded Runs (*.json) and their typed loader
└── tests/           unit tests on fake/; <harness>.e2e.test.ts on real/,
                     which writes what it records into fake/recordings/
```

Package exports per harness: `./<harness>` is `contract/`, `./<harness>/real`
is `real/`, `./<harness>/fake` is `fake/`. Callers import the Layers as
namespaces: `import * as ClaudeReal from '@kestack/ai-toolkit-v2/claude/real'`,
then `ClaudeReal.layer({ linger })`.

Inside `shared/`, `real/` and `fake/` the layout is free-form: keep it
small, and add a sub-folder only when it is needed. Nothing in `contract/`
imports Node.

## Code rules

- Effect 4 (`effect` 4.1 here). Child processes through
  `effect/unstable/process` with `@effect/platform-node`'s layer, or the
  harness's own SDK.
- No comments (`monoverse/no-comments`). A limit set by the harness goes in
  the harness README instead.
- `pnpm -F @kestack/ai-toolkit-v2 lint` and `test` green: `vp check`, `tsc
  --noEmit`, `monoverse lint`.
- Tests with `@effect/vitest`. Unit tests drive the Service on the fake
  driver. E2E tests run only with `AI_TOOLKIT_V2_E2E=1`, use the cheapest
  model and the shortest prompts, run in a temp folder, and save what the
  harness wrote to `recordings/` for the fakes and unit tests to replay.

## The fake

`fake/`'s `layer` gives the whole Service without the harness. Each Run
replays a recording (chosen by the caller, or the first one), with ids made
fresh; requests in it wait for `respond`; harness-specific methods answer
from fixed data. The fake follows every routing rule above, since it shares
the router and instance code and only swaps the driver.
