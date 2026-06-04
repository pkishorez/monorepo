# monoverse — Effect v4 migration notes

Migrated `monoverse` (the CLI package) from Effect v3 to `4.0.0-beta.78`.
Scope was larger than the CLI layer: the package's `core` and `tui` still used
v3 Effect/Schema/Service APIs and only compiled because the repo had not yet
type-checked against v4. All of it was brought to v4.

## CLI (`@effect/cli` → `effect/unstable/cli`)

The CLI API changed shape, not just import path:

- **Module split.** `@effect/cli`'s `Options` → `Flag`, `Args` → `Argument`.
  `Command` and `Prompt` keep their names. All under `effect/unstable/cli`.
- **`Args.text({ name })` → `Argument.string(name)`** (positional name is a
  plain string arg, no options object).
- **`Options.choice(name, choices)` → `Flag.choice(name, choices)`**, preserves
  the literal-union return type (`Flag<Choices[number]>`).
- **`Options.text` → `Flag.string`**, `Options.boolean` → `Flag.boolean`.
- **`Options.withAlias/withDefault/optional` → `Flag.withAlias/withDefault/
optional`** (same pipe semantics).
- **`Prompt.select({ message, choices: [{ title, value }] })` is unchanged**;
  `Prompt` is still a yieldable Effect, so `yield* Prompt.select(...)` works.
- **`Command.make(name, config, handler)` is unchanged.** `withSubcommands`,
  `pipe` composition unchanged.
- **`Command.run(command, { name, version })` → `Command.run(command,
{ version })`** — the `name` field is gone, and the result is now an
  **`Effect`** (reads argv from the `Stdio` service in `Command.Environment`),
  not a `(argv) => Effect` function. So `cli(process.argv).pipe(...)` became
  `cli.pipe(...)` and `process.argv` is no longer threaded manually.
- **`CliConfig` is removed.** There is no v4 equivalent for
  `CliConfig.layer({ isCaseSensitive, showBuiltIns, showTypes })`. The layer was
  dropped. Behavioral consequence: subcommand/flag matching is **case-sensitive**
  in v4 (v3 had `isCaseSensitive: false`); built-ins/types display is no longer
  configurable. No public command names changed, so observable CLI behavior is
  the same for normal usage.

## Platform (`@effect/platform-node`, surviving package)

- **`NodeContext` is gone.** Use **`NodeServices.layer`**, which provides the
  full `Command.Environment` (FileSystem, Path, Stdio, Terminal,
  ChildProcessSpawner, Crypto). It replaces `NodeContext.layer`.
- `NodeRuntime.runMain` is unchanged (`runMain(options)(effect)` /
  `runMain(effect, options)`), but the effect handed to it must be fully
  provided (`Effect<A, E>` — no `R`).

## Services (`Effect.Service` → `Context.Service`)

- **`Effect.Service<Self>()(id, { succeed: {...} })` → `Context.Service<Self>()
(id, { make: Effect.succeed({...}) })`.** The `succeed`/`effect` config keys
  are replaced by a single `make` (an Effect or factory).
- **No auto-generated `.Default` layer.** Build it yourself:
  `static readonly layer = Layer.effect(this, this.make)`. All `Monoverse.Default`
  call sites became `Monoverse.layer`. The class is still yieldable as a tag.

## Schema / Effect / Cause (core + tests)

These follow the shared learnings already in `effect-v4-learnings.md`:

- `Schema.Record({ key, value })` → `Schema.Record(key, value)`.
- `Schema.Union(a, b)` → `Schema.Union([a, b])` (array argument).
- `Schema.decodeUnknown(s)` → `Schema.decodeUnknownEffect(s)`.
- `Effect.catchAll` → `Effect.catch`.
- `Effect.either` → `Effect.result` (`Result`, `.success`/`.failure`,
  `Result.isSuccess`/`isFailure`).
- `Effect.try(thunk)` → `Effect.try({ try, catch })` (the bare-thunk overload is
  gone; only the `{ try, catch }` object form remains).
- Flattened Cause in a test: `exit.cause._tag === 'Fail'` / `.error` →
  `Cause.findError(exit.cause)` (returns `Result`), `Result.isSuccess` +
  `.success`.

## Verification

- `pnpm --filter monoverse build` (bun build.ts) — pass.
- `pnpm --filter monoverse lint` (vp check && tsc) — pass.
- `pnpm --filter monoverse test` (vp test) — 80 tests pass, 0 removed/skipped.
- Smoke-tested `dist/cli.js --help` and `dist/cli.js ls` — commands render
  correctly.
