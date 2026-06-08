# @monorepo/vtest — the story

vtest exists for one moment: you're staring at a package — say `@std-toolkit/cache` — its
80 tests are noise, the test code is unreadable in isolation, and you just want to _understand
what this thing does_. vtest turns a package's behavior into **flat, per-feature documentation
that embeds its own runnable tests** — so you read a sentence, see the test that proves it,
click it, and watch it go green live.

This package is the **server + the model behind that experience**. The UI lives elsewhere
(`@monorepo/frontend`'s `blocks/vtest` + kishore-app's `routes/vtest`). This README is the
map of how the server is built and _why it is shaped the way it is_.

## The shape: six deep modules, one waterfall

The package is a layered set of [deep modules](../../.claude/skills/deep-module) — each a folder
with a hidden interior behind a pure-barrel `index.ts`. Imports only ever flow **downward**:

```
cli  ─▶  server  ─▶  rpc        (the contract)
                 ─▶  runtime    (boots Vitest)
                          ─▶  analysis   (pure, runs nothing)
                                   ─▶  authoring
```

`pnpm lint:depcruise` enforces that arrow direction. Reach upward and it fails.

Each module is one chapter of the story:

### 1. `authoring/` — how behavior gets written down

The only chapter that exists today. Two frozen functions, `vtest(name, doc, fn)` and
`vdescribe(name, doc, fn)`. The middle string — the **vdoc** — is the human explanation,
stored on `task.meta.vdoc`. Everything downstream reads this vocabulary. Imports nothing.

> `vtest("evicts the oldest entry", "When the store is full, the least-recently-used entry is dropped.", () => { ... })`

### 2. `analysis/` — making sense of a `vtest/` folder _without running anything_

Point it at a package root. It reads the filesystem and answers, as **pure functions**:

- **discover** — what features and test groups exist (`vtest/features/{feature}/` + `tests/{id}/`).
- **parse** — where the `::test-group{id=…}` directives sit in each `doc.md`.
- **toc** — load the typed `toc.ts` into an ordered, sectioned table of contents.
- **validate** — does every directive have a folder? every folder a directive? → a list of
  **diagnostics** (errors/warnings).

No Vitest, no network, no state. This is the "is this package's documentation _healthy_?" brain.
It is deliberately inert — it never runs a test. (That's why it's `analysis/`, not
`orchestrator/`: the thing that orchestrates is `server/`.)

### 3. `runtime/` — actually running the tests

The **only** chapter that boots Vitest. Given "run group `eviction` in cache", it lazily starts
a `createVitest` instance scoped to **only** `vtest/features/**/tests/**/*.test.ts`, runs the
requested subset, and reads results (status + vdoc) back into a result tree. It is expensive,
stateful, and **cached per package** (idle-evicted). It also owns the **live store** — a
`PubSub`/`Queue` of `TestEvent`s (`run-started`, `test-updated`, `run-finished`,
`health-updated`) that watch-mode and manual runs both write to. Kept far from `analysis/` so
_reading docs never accidentally boots a test runner_.

### 4. `rpc/` — the contract both sides agree on

Pure schema, zero logic: the menu of procedures (`Discover`, `GetToc`, `GetFeature`, `RunAll`,
`RunGroup`, `RunTest`, `Reload`, `Subscribe`) and their request/response shapes. It is its own
module because **kishore-app imports this and must never pull in the server's Node/Vitest/fs
code**. The contract is the one type-safe artifact client and server share, so it can't drift.

### 5. `server/` — the kitchen that fulfills the menu

Wires each `rpc/` procedure to its implementation: `GetFeature` → `analysis`, `RunGroup` →
`runtime`. Sets up HTTP, CORS, NDJSON serialization. This is the real orchestrator — the only
chapter that imports almost all the others.

### 6. `cli/` — the front door for a human

`vtest-serve`. Type it with **no arguments** and it just works: picks a default port (`14319`),
discovers the repo root from cwd, opens the kitchen. kishore-app connects.

## How the client talks to it (and why not tanstack-sync)

kishore-app's data needs come in three shapes, each matched to its right tool — and **none** of
them is tanstack-sync. tanstack-sync (what `otel` uses) is built for an **append-only log** synced
by cursor (telemetry rows keep arriving). vtest's data is _not_ that:

| Data                                 | Shape                                        | Tool                                                    |
| ------------------------------------ | -------------------------------------------- | ------------------------------------------------------- |
| `discover` / `getToc` / `getFeature` | one-shot **documents**                       | unary RPC + **tanstack-query**                          |
| `runGroup` / `runTest` / `reload`    | imperative **actions**                       | unary RPC + **mutation**                                |
| test statuses queued→running→pass    | **in-place row mutations**, keyed by test id | **streaming** RPC `Subscribe` → **react-db** collection |

Live statuses are the one genuinely streaming channel. Effect RPC supports this first-class
(`RpcSchema.Stream(success, error)` as an `Rpc`'s success → the client receives a real
`Stream<TestEvent>`). We bridge that stream into a `@tanstack/react-db` collection keyed by test
id and `useLiveQuery` it, so each badge re-renders the instant its row flips. **Exactly one
streaming procedure; everything else unary.** No cursor machinery — these rows _mutate_, they
don't _append_.

> **react-db vs tanstack-sync:** react-db is the client-side _reactive store_ (typed collections
> of rows; writes re-render subscribers). tanstack-sync is a layer on top that _fills_ a
> collection via cursor-paginated Effect queries. We use the store; we skip the cursor layer.

## Writing good `vtest/` content (the authoring doctrine)

The whole point of vtest is that a package's `vtest/` reads like a **short course**, not an API
dump. A newcomer should be able to follow it top-to-bottom and _understand the package_. When you
author a package's `vtest/`:

- **Big picture first.** `home.md` opens with the mental model — what problem the package solves,
  its 3–5 core concepts, how they fit — _before_ any function signature. Why before how.
- **One concept per feature.** Each `features/{feature}/` teaches exactly one idea, named for the
  concept (not a function). `doc.md` _motivates → explains → shows an example → embeds the test
  that proves it._ Short sections, concrete examples, no wall-of-text.
- **Course order.** `toc.ts` is a syllabus: foundational concepts first, advanced/edge later;
  sections form a learning arc. Reading in order builds understanding cumulatively.
- **Tests illustrate, they don't blanket.** Add a `::test-group` only where a runnable test
  _illuminates_ the concept. A few teaching tests beat exhaustive coverage — exhaustive coverage
  lives in the package's own `src/**/__tests__`, which vtest never touches. Each test's vdoc is a
  one-line teaching caption, not a restatement of the assertion.
- **Superior UX over completeness.** If a behavior doesn't help a newcomer understand the package,
  leave it out of `vtest/`. When in doubt, slip scope (fewer, clearer features) rather than dump.

## The walk, end to end

1. Run `vtest-serve` (`cli`). Server opens on `14319`.
2. kishore-app calls `Discover` → packages with a `vtest/` folder. You add `cache` to your list.
3. You drill in: `GetToc(cache)` → sectioned outline + diagnostics (from `analysis`, nothing ran).
4. You open a folder: `GetFeature(cache, eviction)` → its `doc.md`, directive positions, and the
   static test list per group. You read one topic at a time.
5. You click a test group's run button: `RunGroup` (`runtime` boots Vitest once, cached).
6. You're `Subscribe`d: `test-updated` events stream in, the react-db rows flip, the badge goes
   green in front of you.
7. You edit a `.test.ts`; watch-mode re-runs just that file and streams the change. You edit a
   `doc.md`; `health-updated` re-validates and runs zero tests.

That's vtest: **read the behavior, prove it live.**
