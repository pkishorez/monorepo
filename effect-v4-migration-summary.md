# Effect v4 migration summary

Migration of every first-party Effect-dependent package in this monorepo from
Effect v3 to **`4.0.0-beta.78`**, done strictly bottom-up (leaves before
parents), one sequential commit per package. Minimal, idiomatic v3→v4 changes —
not a rewrite; public APIs kept compatible, no tests removed.

- Durable cross-package knowledge: [`effect-v4-learnings.md`](./effect-v4-learnings.md)
- Per-package detail: each package's `effect-v4-migration-notes.md` (linked below)

## Final gate

Run from the repo root: `pnpm lint && pnpm test && pnpm build` — **all green**.

| Command      | Result                                                     |
| ------------ | ---------------------------------------------------------- |
| `pnpm lint`  | ✅ pass                                                    |
| `pnpm test`  | ✅ pass (zero tests removed repo-wide; verified via `git`) |
| `pnpm build` | ✅ pass                                                    |

The dual-version state has fully collapsed to a single coherent v4 install.

## Status table

15 commits in order (commit 0 = up-front bump, then 14 package migrations).
Net delta is `git show --shortstat` per commit.

| #   | SHA       | Package                                                                        | Status | Net Δ (lines) | Weight / note                                                            |
| --- | --------- | ------------------------------------------------------------------------------ | ------ | ------------- | ------------------------------------------------------------------------ |
| 0   | `dc8ae02` | _up-front bump_ + seed learnings                                               | ✅     | +425 −621     | ecosystem pin to `4.0.0-beta.78`; turns repo red                         |
| 1   | `101ae1a` | [`@std-toolkit/eschema`](./std-toolkit/eschema/effect-v4-migration-notes.md)   | ✅     | +273 −113     | light; `Schema.Schema` now single-param, two type surfaces narrowed      |
| 2   | `af07efe` | [`use-effect-ts`](./packages/use-effect-ts/effect-v4-migration-notes.md)       | ✅     | +60 −8        | light; `Scope.extend`→`provide`, `Fiber.interrupt` returns `void`        |
| 3   | `0c5744e` | [`trace-viewer`](./packages/trace-viewer/effect-v4-migration-notes.md)         | ✅     | +100 −18      | light; `Cause.hasInterrupts`, `Schema.Literals`, `decodeUnknownResult`   |
| 4   | `f015d3c` | [`@std-toolkit/core`](./std-toolkit/core/effect-v4-migration-notes.md)         | ✅     | +304 −111     | **HEAVY**; `@effect/rpc`→`effect/unstable/rpc`, socket/platform moves    |
| 5   | `0322825` | [`monoverse`](./packages/monoverse/effect-v4-migration-notes.md)               | ✅     | +234 −99      | medium; `@effect/cli`→`effect/unstable/cli`, `Options`→`Flag`/`Argument` |
| 6   | `5c3e32f` | [`@std-toolkit/cache`](./std-toolkit/cache/effect-v4-migration-notes.md)       | ✅     | +82 −53       | light; `SortedMap` removed from core                                     |
| 7   | `2968cf7` | [`@std-toolkit/sqlite`](./std-toolkit/db-sqlite/effect-v4-migration-notes.md)  | ✅     | +172 −72      | medium; `Context.Tag`→`Context.Service`, `FiberRef`→`Context.Reference`  |
| 8   | `0978ef2` | [`db-dynamodb`](./std-toolkit/db-dynamodb/effect-v4-migration-notes.md)        | ✅     | +207 −143     | medium; `FileSystem`/`HttpClient` core+`unstable/http` moves; 299 tests  |
| 9   | `7b6b092` | [`@std-toolkit/tanstack`](./std-toolkit/tanstack/effect-v4-migration-notes.md) | ✅     | +69 −18       | light; `Semaphore` module, `forkChild`, `Effect.catch`                   |
| 10  | `0c8cfdc` | [`tanstack-sync`](./std-toolkit/tanstack-sync/effect-v4-migration-notes.md)    | ✅     | +42 −14       | light; `Semaphore.makeUnsafe`, `forkDaemon`→`forkDetach`                 |
| 11  | `5f93eaf` | [`lotel`](./packages/lotel/effect-v4-migration-notes.md)                       | ✅     | +174 −67      | medium; `@effect/cli` fold                                               |
| 12  | `a3c0a31` | [`code`](./apps/code/effect-v4-migration-notes.md)                             | ✅     | +200 −259     | medium; OTLP exporters moved, `@effect/opentelemetry` dep removed        |
| 13  | `c936286` | [`finances`](./apps/finances/effect-v4-migration-notes.md)                     | ⚠️     | +120 −36      | medium; one narrowing cast for an `RpcServer.layer` v4 typing quirk      |
| 14  | `f4daa24` | [`kishore-app`](./apps/kishore-app/effect-v4-migration-notes.md)               | ✅     | +306 −142     | medium; OTLP→`effect/unstable/observability`; 38 files                   |

Legend: ✅ clean / ⚠️ landed green with a flagged caveat (see residual risks).

## Skipped packages (non-Effect)

No Effect dependency, so out of migration scope:

- `vtest`
- `frontend` (`packages/frontend`)
- `dependency-cruiser-viz`

## Ecosystem packages

Final pin for every first-party package and surviving `@effect/*` dep:
**`4.0.0-beta.78`**.

**Removed** (functionality folded into `effect` core / `effect/unstable/*`):

- `@effect/rpc` → `effect/unstable/rpc` (core)
- `@effect/cli` → `effect/unstable/cli` (monoverse, lotel)
- `@effect/platform` `Socket`/`FileSystem`/`HttpClient` → `effect/unstable/socket`,
  `effect/FileSystem`, `effect/unstable/http`
- `@effect/opentelemetry` → `effect/unstable/observability` (OTLP exporters);
  the explicit dep was **removed from `code`**

**Retained** (surviving v4 packages, pinned `4.0.0-beta.78`):

- `@effect/platform-node` (lotel, monoverse, db-dynamodb, code, finances)
- `@effect/platform-browser` (kishore-app, code, finances)

See [`effect-v4-learnings.md`](./effect-v4-learnings.md) for the full API-rename
catalogue rather than duplicating it here.

## Residual risks / follow-ups

- **Bump off `beta.78`** — tracked follow-up. The whole repo is pinned to a
  single beta; a future bump should re-run this same gate. Watch the items below
  on the next bump.
- **finances** — one narrowing cast `as Effect.Effect<void>` around an
  `RpcServer.layer` v4 `any`-typing quirk. No runtime change; revisit when the
  upstream typing is fixed. See
  [finances notes](./apps/finances/effect-v4-migration-notes.md).
- **code / kishore-app** — OTLP exporters moved from `@effect/opentelemetry` to
  `effect/unstable/observability`; verify on bumps as `unstable/*` is volatile.
- **kishore-app** — blog `fiber-part-2/page.mdx` prose still narrates
  "forkDaemon" (cosmetic docs follow-up, not a code change).

## Tooling note

Root `vp check` (run by `pnpm lint`) walks the whole repo tree, including the
read-only vendored `repos/effect-smol` subtree, and aborted (trap 6) on its
volume. Added `repos/effect-smol/**` to the `lint` and `fmt` `ignorePatterns` in
`vite.config.ts` so the gate scans first-party code only. This is a config-level
exclusion of read-only reference material — not a source change to any package
and not an edit to the subtree.
