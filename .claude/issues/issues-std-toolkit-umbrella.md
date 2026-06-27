# Issues: std-toolkit-umbrella

Source: `this conversation`
Repo root: `/Users/kishorepolamarasetty/CAREER/MINE/monorepo`
Project commands: `pnpm --filter std-toolkit test` (vitest) · `pnpm --filter std-toolkit lint` + `pnpm --filter std-toolkit lint:depcruise` · `pnpm --filter std-toolkit build` (tsc)

## North Star

Collapse the five private `@std-toolkit/*` packages (core, eschema, db-dynamodb, db-sqlite, tanstack-sync) into a single **publishable** npm package named `std-toolkit`, where each former package becomes an internal folder under `std-toolkit/src/<folder>/` exposed as a subpath export (`std-toolkit/core`, `std-toolkit/eschema`, `std-toolkit/dynamodb`, `std-toolkit/sqlite`, `std-toolkit/tanstack-sync`). The internal folders are never published as standalone packages — only the umbrella ships. The one constraint we slip scope before violating: **the public subpath surface (top-level + every existing nested subpath) must be preserved 1:1**, so consumers only ever change the package prefix, never lose an entry point. "Good" is observable as: `pnpm --filter std-toolkit build` emits `dist/<folder>/...` matching the `exports` map, `depcruise-viz lint` passes (and fails on a deliberate cross-folder violation), and every in-repo consumer plus the external `voucherify` app typechecks against the new subpaths.

## Glossary

- **Umbrella package** — the single `std-toolkit` package at `std-toolkit/` that contains all former packages as `src/<folder>/` subtrees.
- **Folder / internal module** — a former package (e.g. `eschema`) now living at `std-toolkit/src/<folder>/`, with its own `index.ts` barrel as its only public face.
- **Subpath export** — an `exports` map entry like `std-toolkit/eschema` resolving to `dist/eschema/index.js`.
- **DAG** — the allowed internal dependency graph: `eschema` is a leaf (depends on nothing internal); `core` → `eschema`; each of `dynamodb`, `sqlite`, `tanstack-sync` → `core` + `eschema`; the three db/sync folders never depend on each other; no cycles.
- **feature / layer / module** — primitives of the `dependency-cruiser-viz` DSL used in `depcruise.config.ts` (`feature` models a cross-folder boundary via `visibility`/`sharedWith`; `layer`/`layersTopDown` model intra-folder ordering).
- **vp** — the `vite-plus` CLI (`vp check`, `vp fmt`, `vp run -r <script>`) used for lint/format/recursive-script orchestration. Distinct from `depcruise-viz`.

## Conventions

- Files kebab-case only (see `CLAUDE.md`). Comments only when necessary; JSDoc allowed for functions/classes.
- Each folder's tests live colocated at `std-toolkit/src/<folder>/**/__tests__/**/*.test.ts` (the vitest `include` pattern used today in every package's `vite.config.ts`).
- `exports` entries point at built `./dist/...`, never `src` — consumers build before importing (existing convention across all 5 packages). No `publishConfig.exports` swap.
- Build = `tsc`; test = `vitest run`; lint = `vp check && tsc --noEmit`; depcruise = `depcruise-viz lint`.
- `repos/effect-smol` is read-only reference — never import from it.

---

## Task: Collapse the five packages into the `std-toolkit` umbrella [AFK]

**Why.** This is the foundational move the whole North Star rests on: until the five packages are one buildable umbrella with the full subpath surface, nothing else (boundaries, docs, consumer migrations) can run. Delivers the single publishable `std-toolkit` package.

**What.** Physically merge `std-toolkit/{core,eschema,db-dynamodb,db-sqlite,tanstack-sync}` into one package rooted at `std-toolkit/`, each former package relocated to `std-toolkit/src/<folder>/` with folders renamed to drop `db-` prefixes (`db-dynamodb`→`dynamodb`, `db-sqlite`→`sqlite`). Produce one merged `package.json`, one hoisted `tsconfig.json` and one `vite.config.ts`, rewrite cross-package imports to relative paths, move the eschema agent skill to the package root, and update the workspace glob. Depcruise config and READMEs are explicitly handled in later tasks — do not author them here.

Concretely:

1. **Workspace glob.** In `/Users/kishorepolamarasetty/CAREER/MINE/monorepo/pnpm-workspace.yaml`, change the `std-toolkit/*` entry to `std-toolkit` (the dir itself becomes the package).
2. **Relocate sources** into `std-toolkit/src/`:
   - `core/src/*` → `src/core/*` (barrel `src/core/index.ts`)
   - `eschema/src/*` → `src/eschema/*` (barrel `src/eschema/index.ts`; CLI at `src/eschema/cli/main.ts`)
   - `db-dynamodb/src/*` → `src/dynamodb/*` (barrel `src/dynamodb/index.ts`)
   - `db-sqlite/src/*` → `src/sqlite/*` (barrel `src/sqlite/index.ts`; adapters under `src/sqlite/sql/adapters/`)
   - `tanstack-sync/src/*` → `src/tanstack-sync/*` (barrel `src/tanstack-sync/index.ts`)
     Delete the now-empty `std-toolkit/{core,eschema,db-dynamodb,db-sqlite,tanstack-sync}/` dirs and their per-package `package.json`/`tsconfig.json`/`vite.config.ts` (the two existing `depcruise.config.ts` files in `db-dynamodb` and `tanstack-sync` are consumed by Task 2 — preserve their contents somewhere Task 2 can read, e.g. keep them at `src/dynamodb/depcruise.config.ts` / `src/tanstack-sync/depcruise.config.ts` until Task 2 folds them in, then Task 2 deletes them).
3. **Relativize cross-package imports.** Every `@std-toolkit/core`, `@std-toolkit/eschema`, `@std-toolkit/eschema/*` import inside the moved sources becomes a relative import to the sibling folder's barrel (e.g. in `src/core/*`, `@std-toolkit/eschema` → `../eschema`; in `src/dynamodb/*` and `src/sqlite/*` and `src/tanstack-sync/*`, `@std-toolkit/core` → `../core`, `@std-toolkit/eschema` → `../eschema`). Cross-folder imports must target the sibling **barrel** (`../eschema`), never a deep path (`../eschema/internal/...`) — Task 2 enforces this.
4. **Merged `std-toolkit/package.json`:**
   - `"name": "std-toolkit"`, `"version": "0.0.1"`, `"private": false`, `"type": "module"`.
   - `"license"`, `"repository"`, `"description"`, `"keywords"` filled (use repo's existing license; repository = this monorepo).
   - `"bin": { "eschema": "dist/eschema/cli/main.js" }`.
   - `"files": ["dist", "src", "README.md", "LICENSE"]`.
   - `"peerDependencies": { "effect": "4.0.0-beta.78", "@tanstack/react-db": ">=0.1.64", "react": ">=18" }` with `"peerDependenciesMeta": { "@tanstack/react-db": { "optional": true }, "react": { "optional": true } }` (effect required; the other two optional).
   - `"dependencies"` = union of the non-workspace deps: `@effect/platform-node`, `@standard-schema/spec`, `kleur`, `aws4fetch`, `type-fest`, `idb` (pin to the versions currently used in the five packages).
   - `"scripts"`: `build: "tsc"`, `dev: "tsc --watch"`, `test: "vitest run"`, `test:watch: "vitest"`, `lint: "vp check && pnpm lint:tsc"`, `lint:tsc: "tsc --noEmit"`, `lint:depcruise: "depcruise-viz lint"`, `fmt: "vp fmt"`. (Carry over `generate`/`play` scripts from the former dynamodb/sqlite packages if present, rebasing their paths.)
   - `"exports"` map (point at `dist`, preserve every existing nested subpath, rebased under the folder):
     - `"./core"` → `dist/core/index.{js,d.ts}`
     - `"./eschema"` → `dist/eschema/index.{js,d.ts}`; `"./eschema/*"` → `dist/eschema/*` (wildcard)
     - `"./dynamodb"` → `dist/dynamodb/index.{js,d.ts}`; `"./dynamodb/rpc"` → `dist/dynamodb/rpc/index.{js,d.ts}`; `"./dynamodb/*"` → `dist/dynamodb/*`
     - `"./sqlite"` → `dist/sqlite/index.{js,d.ts}`; `"./sqlite/rpc"` → `dist/sqlite/rpc/index.{js,d.ts}`; `"./sqlite/adapters/{do,better-sqlite3,bun,node}"` → `dist/sqlite/sql/adapters/<name>.{js,d.ts}`
     - `"./tanstack-sync"` → `dist/tanstack-sync/index.{js,d.ts}`; `"./tanstack-sync/paced"` → `dist/tanstack-sync/paced/index.{js,d.ts}`; `"./tanstack-sync/offline-storage/idb"` → `dist/tanstack-sync/offline-storage/<existing target>.{js,d.ts}`
       Cross-check each entry against the pre-move `exports` of the corresponding package and keep the `types`/`import`/`default` condition shape those used.
5. **Hoisted `std-toolkit/tsconfig.json`** covering `src/**`, emitting declarations + declaration maps to `dist/` mirroring `src/` (so go-to-def reaches real source, matching the `files: ["src"]` decision). Base it on the former packages' tsconfigs.
6. **Hoisted `std-toolkit/vite.config.ts`** (vite-plus) with `test.include: ['src/**/__tests__/**/*.test.ts']`, `resolve.tsconfigPaths: true`, and `lint`/`fmt` `ignorePatterns: ['dist/**']` — matching the existing per-package `vite.config.ts` shape.
7. **Move the eschema skill** from `std-toolkit/eschema/.claude/skills/eschema-usage` to `std-toolkit/.claude/skills/eschema-usage`, updating any path reference inside it from `std-toolkit/eschema/...` to `std-toolkit/src/eschema/...`.
8. **Changesets.** Inspect `/Users/kishorepolamarasetty/CAREER/MINE/monorepo/.changeset/config.json`; ensure `std-toolkit` (now `private: false`) is publishable — remove the five old package names if listed in `ignore`, and add `std-toolkit` is not ignored. Do not change versioning strategy otherwise.

**Read first.**

- `std-toolkit/core/package.json`, `std-toolkit/eschema/package.json`, `std-toolkit/db-dynamodb/package.json`, `std-toolkit/db-sqlite/package.json`, `std-toolkit/tanstack-sync/package.json` — the five `exports`/`deps`/`bin`/`scripts` to merge.
- `std-toolkit/core/vite.config.ts` — the vitest/lint config shape to hoist.
- `packages/dependency-cruiser-viz/package.json` — the `files: ["src","dist",...]` + dist-pointing `exports` convention to mirror.
- `pnpm-workspace.yaml` — current globs (`apps/*`, `packages/*`, `std-toolkit/*`).
- `.changeset/config.json` — release/ignore config to reconcile.
- `CLAUDE.md` — kebab-case + comment rules.

**Interface produced.**

- Package `std-toolkit` at `std-toolkit/`, declarable as `"std-toolkit": "workspace:*"` in-repo and `"std-toolkit": "file:../../../monorepo/std-toolkit"` cross-repo.
- Public subpaths consumers quote verbatim: `std-toolkit/core`, `std-toolkit/eschema`, `std-toolkit/eschema/*`, `std-toolkit/dynamodb`, `std-toolkit/dynamodb/rpc`, `std-toolkit/sqlite`, `std-toolkit/sqlite/rpc`, `std-toolkit/sqlite/adapters/{do,better-sqlite3,bun,node}`, `std-toolkit/tanstack-sync`, `std-toolkit/tanstack-sync/paced`, `std-toolkit/tanstack-sync/offline-storage/idb`.
- Built output layout `std-toolkit/dist/<folder>/...` and `bin` command `eschema`.
- The two former depcruise configs preserved at `src/dynamodb/depcruise.config.ts` and `src/tanstack-sync/depcruise.config.ts` for Task 2 to consume.

**Inputs from predecessors.** None — can start immediately.

**Out of scope.**

- Do not author `std-toolkit/depcruise.config.ts` (Task 2) or any README (Task 3).
- Do not touch any consumer (`apps/*`, `packages/lotel`, voucherify) — Tasks 4–7 own those.
- Do not redesign sqlite native-binding handling — preserve current dynamic/consumer-provided behavior.

**Acceptance criteria.**

- [ ] `pnpm install` at repo root succeeds with the new single-package workspace.
- [ ] `pnpm --filter std-toolkit build` emits `dist/<folder>/...` for all five folders; every `exports` target file exists on disk.
- [ ] `pnpm --filter std-toolkit lint:tsc` (i.e. `tsc --noEmit`) passes — no remaining `@std-toolkit/*` import inside `src/`.
- [ ] `pnpm --filter std-toolkit test` passes (colocated tests run from `src/**/__tests__`).
- [ ] `node -e "require.resolve('std-toolkit/sqlite/adapters/node')"`-style resolution (via the package `exports`) succeeds for a sampled top-level and nested subpath.

**Done when.** `pnpm --filter std-toolkit build && pnpm --filter std-toolkit lint:tsc && pnpm --filter std-toolkit test` all succeed and no `@std-toolkit/` specifier remains under `std-toolkit/src/`.

---

## Task: Enforce internal boundaries via a merged depcruise.config.ts [AFK]

**Why.** Collapsing packages removes the npm-resolution wall that kept `dynamodb` out of `core`'s internals and kept `eschema` a leaf. This slice restores that wall as a build-failing lint, preserving the encapsulation the North Star depends on.

**What.** Author a single `std-toolkit/depcruise.config.ts` (using the `dependency-cruiser-viz` DSL) where each of the five folders is a `feature` whose `visibility`/`sharedWith` encodes the DAG, with each former package's intra-folder `layer`/`layersTopDown` rules folded in and rebased under `src/<folder>/`. Wire it so a violation fails the build.

Concretely:

- `rootDir: 'src'`.
- One `feature` per folder: `core`, `eschema`, `dynamodb`, `sqlite`, `tanstack-sync`.
- Encode the DAG: `eschema` shared with all four others (it's the leaf everyone may use); `core` shared with `dynamodb`, `sqlite`, `tanstack-sync`; `dynamodb`/`sqlite`/`tanstack-sync` **not** shared with each other; `eschema` must depend on no other folder; no cycles.
- Fold the two preserved per-package configs (`src/dynamodb/depcruise.config.ts`, `src/tanstack-sync/depcruise.config.ts` — the latter defines `entrypoint→sync→projection→inspector→paced→registry→source-of-truth→offline-storage→util` top-down layers and `api`/`partitioned`/`single-item` features with `module(...)` visibility) into the merged config, rebasing every path from `src/...` to `src/<folder>/...`. Delete those two interim files afterward.
- For `core`, `eschema`, `sqlite` (no prior config) define at least the folder-level `feature` and barrel rule; add intra-folder layers only where an obvious ordering exists (don't invent).
- Forbid deep cross-folder imports: a module under `src/<a>/**` may reach `src/<b>/**` only through `src/<b>/index.ts`.
- Ensure `lint:depcruise` (`depcruise-viz lint`) runs as part of the package lint gate so violations fail CI/build.

**Read first.**

- `std-toolkit/src/tanstack-sync/depcruise.config.ts` (preserved by Task 1) — the richest existing layer/feature/module example to rebase.
- `std-toolkit/src/dynamodb/depcruise.config.ts` (preserved by Task 1) — second config to fold in.
- `packages/dependency-cruiser-viz/src/index.ts` (and `./node`) — exported `feature`, `layer`, `layersTopDown`, `module`, `ProjectConfig` signatures.
- `packages/dependency-cruiser-viz/package.json` — `depcruise-viz lint` CLI invocation (`bin` / `lint:depcruise` script).

**Interface produced.**

- `std-toolkit/depcruise.config.ts` (default-exported `ProjectConfig`) and a passing `pnpm --filter std-toolkit lint:depcruise`.

**Inputs from predecessors.** Task `Collapse the five packages into the std-toolkit umbrella` produces the moved sources under `std-toolkit/src/<folder>/` and the two preserved configs at `std-toolkit/src/dynamodb/depcruise.config.ts` and `std-toolkit/src/tanstack-sync/depcruise.config.ts`. Read those for the layer definitions to rebase.

**Out of scope.**

- Do not edit `src/**/*.ts` sources except to fix a genuine boundary violation the config surfaces (if found, prefer routing the import through the sibling barrel).
- Do not touch `package.json` fields other than confirming the `lint:depcruise` script exists (Task 1 created it).

**Acceptance criteria.**

- [ ] `pnpm --filter std-toolkit lint:depcruise` passes on the clean tree.
- [ ] A deliberately added deep cross-folder import (e.g. `src/dynamodb/index.ts` importing `../core/broadcaster` directly instead of `../core`) makes `lint:depcruise` exit non-zero; revert the probe after confirming.
- [ ] A deliberate `eschema`→`core` import makes `lint:depcruise` fail (leaf rule); revert after confirming.

**Done when.** `pnpm --filter std-toolkit lint:depcruise` passes clean and fails on both probe violations above, and the two interim per-folder depcruise files are deleted.

---

## Task: Author root + per-folder READMEs [AFK]

**Why.** With per-folder docs now serving as the subpath documentation for a published package, each subpath needs a readable entry point and the root needs a published-package README (it ships via `files`).

**What.** Write `std-toolkit/README.md` (what the package is, install, the subpath table) and one `std-toolkit/src/<folder>/README.md` per folder (core, eschema, dynamodb, sqlite, tanstack-sync) describing that folder's subpath(s) and primary entry points, linked from the root README.

**Read first.**

- `std-toolkit/package.json` (post-Task-1) — the `exports` map = the canonical subpath list to document.
- `packages/dependency-cruiser-viz/README.md` — house style for a package README.
- `std-toolkit/.claude/skills/eschema-usage` — existing eschema usage guidance to summarize/link from the eschema folder README.

**Interface produced.**

- `std-toolkit/README.md` + `std-toolkit/src/{core,eschema,dynamodb,sqlite,tanstack-sync}/README.md` (internal docs only).

**Inputs from predecessors.** Task `Collapse the five packages into the std-toolkit umbrella` produces `std-toolkit/package.json` with the final `exports` map — use it as the authoritative subpath list.

**Out of scope.**

- No code, config, or `package.json` edits. README files only (collision-free with Tasks 2/4/5/6).

**Acceptance criteria.**

- [ ] `std-toolkit/README.md` exists, lists every top-level subpath with a one-line description, and links to each folder README.
- [ ] Each of the five `src/<folder>/README.md` exists and names that folder's public subpath(s).

**Done when.** All six README files exist and the root README's links resolve to the five folder READMEs.

---

## Task: Migrate apps/finances onto std-toolkit subpaths [AFK]

**Why.** Dogfoods the published surface from the heaviest in-repo consumer (12 import sites across core/eschema/sqlite/tanstack-sync), proving the subpath map is complete and correct.

**What.** Replace every `@std-toolkit/*` import specifier in `apps/finances/src` with the `std-toolkit/*` equivalent (pure prefix rewrite — no folder renames apply here), and replace the five `@std-toolkit/*` workspace deps in `apps/finances/package.json` with the single `"std-toolkit": "workspace:*"`.

Rewrite map (prefix only):

- `@std-toolkit/core` → `std-toolkit/core`
- `@std-toolkit/eschema` → `std-toolkit/eschema`; `@std-toolkit/eschema/types` → `std-toolkit/eschema/types`
- `@std-toolkit/sqlite` → `std-toolkit/sqlite`; `@std-toolkit/sqlite/rpc` → `std-toolkit/sqlite/rpc`; `@std-toolkit/sqlite/adapters/better-sqlite` → `std-toolkit/sqlite/adapters/better-sqlite`
- `@std-toolkit/tanstack-sync` → `std-toolkit/tanstack-sync`

**Read first.**

- `apps/finances/package.json` — the `@std-toolkit/*` deps to collapse into one.
- `std-toolkit/package.json` (post-Task-1) — the authoritative `exports` to verify each rewritten specifier resolves.
- The finances import sites: `grep -rl "@std-toolkit/" apps/finances/src`.

**Interface produced.**

- `apps/finances` importing exclusively `std-toolkit/*` subpaths with `"std-toolkit":"workspace:*"` (internal change).

**Inputs from predecessors.** Task `Collapse the five packages into the std-toolkit umbrella` produces the `std-toolkit` package + `exports` map + built `dist/`. Typecheck resolves only after `pnpm --filter std-toolkit build` has run.

**Out of scope.**

- Only `apps/finances/**`. Do not touch other consumers, the umbrella, or any `std-toolkit/src` file.

**Acceptance criteria.**

- [ ] No `@std-toolkit/` specifier remains in `apps/finances`.
- [ ] `apps/finances/package.json` has exactly one toolkit dep: `"std-toolkit":"workspace:*"`.
- [ ] `pnpm install && pnpm --filter finances exec tsc --noEmit` (or the app's typecheck script) passes.

**Done when.** finances typechecks against `std-toolkit/*` subpaths with the single workspace dep and no `@std-toolkit/` specifier remains.

---

## Task: Migrate apps/kishore-app and apps/code onto std-toolkit [AFK]

**Why.** Completes the app-tier dogfooding: kishore-app has one import site, apps/code declares the dep but imports nothing — both must move off the now-nonexistent `@std-toolkit/*` packages.

**What.** In `apps/kishore-app`: rewrite its one `@std-toolkit/tanstack-sync` (and any other `@std-toolkit/*`) import in `src` to the `std-toolkit/*` prefix, and collapse its `@std-toolkit/*` package.json deps into `"std-toolkit":"workspace:*"`. In `apps/code`: replace the `"@std-toolkit/tanstack-sync":"workspace:*"` dep with `"std-toolkit":"workspace:*"` (no import rewrites — it has zero `@std-toolkit/*` import sites).

**Read first.**

- `apps/kishore-app/package.json` — `@std-toolkit/*` deps (all five present per inventory).
- `apps/code/package.json` — single `@std-toolkit/tanstack-sync` dep to swap.
- kishore-app import sites: `grep -rl "@std-toolkit/" apps/kishore-app/src`.
- `std-toolkit/package.json` (post-Task-1) — `exports` to verify rewritten specifiers.

**Interface produced.**

- `apps/kishore-app` and `apps/code` depending on `std-toolkit` (internal change).

**Inputs from predecessors.** Task `Collapse the five packages into the std-toolkit umbrella` produces the `std-toolkit` package + built `dist/`.

**Out of scope.**

- Only `apps/kishore-app/**` and `apps/code/**`. Disjoint from finances (Task 4) and lotel (Task 6).

**Acceptance criteria.**

- [ ] No `@std-toolkit/` specifier remains in either app's `src`.
- [ ] Both apps' `package.json` declare `"std-toolkit":"workspace:*"` and no `@std-toolkit/*` dep.
- [ ] `pnpm install` succeeds and each app's typecheck script passes.

**Done when.** Both apps typecheck (or, for code, install + build) with the single `std-toolkit` workspace dep and no `@std-toolkit/` specifier remains.

---

## Task: Migrate packages/lotel onto std-toolkit subpaths [AFK]

**Why.** lotel is a library consumer (4 import sites across core/eschema/sqlite); migrating it confirms the subpaths work for non-app workspace packages too.

**What.** Rewrite the four `@std-toolkit/*` import specifiers in `packages/lotel/src` to the `std-toolkit/*` prefix, and replace lotel's `@std-toolkit/{core,eschema,sqlite}` workspace deps with `"std-toolkit":"workspace:*"`.

**Read first.**

- `packages/lotel/package.json` — its `@std-toolkit/core`, `@std-toolkit/eschema`, `@std-toolkit/sqlite` deps.
- lotel import sites: `grep -rl "@std-toolkit/" packages/lotel/src`.
- `std-toolkit/package.json` (post-Task-1) — `exports` to verify each rewritten specifier.

**Interface produced.**

- `packages/lotel` importing `std-toolkit/*` with `"std-toolkit":"workspace:*"` (internal change).

**Inputs from predecessors.** Task `Collapse the five packages into the std-toolkit umbrella` produces the `std-toolkit` package + built `dist/`.

**Out of scope.**

- Only `packages/lotel/**`. Disjoint from the app migrations.

**Acceptance criteria.**

- [ ] No `@std-toolkit/` specifier remains in `packages/lotel`.
- [ ] `packages/lotel/package.json` declares `"std-toolkit":"workspace:*"` and no `@std-toolkit/*` dep.
- [ ] `pnpm install && pnpm --filter lotel exec tsc --noEmit` passes.

**Done when.** lotel typechecks against `std-toolkit/*` with the single workspace dep and no `@std-toolkit/` specifier remains.

---

## Task: Migrate external voucherify app onto std-toolkit [AFK]

**Why.** voucherify lives in a separate monorepo and is the real external consumer; migrating it proves the relative-path `file:` install against the umbrella's `dist` works, and exercises the `db-dynamodb`→`dynamodb` rename that no in-repo consumer hits.

**What.** In `/Users/kishorepolamarasetty/CAREER/MINE/private-monorepo/apps/voucherify`, replace the five relative-path `@std-toolkit/*` deps with a single `"std-toolkit": "file:../../../monorepo/std-toolkit"`, rewrite all `@std-toolkit/*` imports in `src` to the `std-toolkit/*` subpaths (applying `db-dynamodb`→`dynamodb`), remove the stale `@std-toolkit/tanstack` entry, then reinstall and typecheck.

Rewrite map:

- `@std-toolkit/core` → `std-toolkit/core`
- `@std-toolkit/eschema` → `std-toolkit/eschema`
- `@std-toolkit/db-dynamodb` → `std-toolkit/dynamodb` ← rename
- `@std-toolkit/tanstack-sync` → `std-toolkit/tanstack-sync`
- `@std-toolkit/tanstack` → **remove** (stale dep, no import sites expected — confirm none, then drop)

**Read first.**

- `/Users/kishorepolamarasetty/CAREER/MINE/private-monorepo/apps/voucherify/package.json` — the five relative-path deps to collapse (`../../../monorepo/std-toolkit/{core,db-dynamodb,eschema,tanstack,tanstack-sync}`).
- voucherify import sites: `grep -rl "@std-toolkit/" /Users/kishorepolamarasetty/CAREER/MINE/private-monorepo/apps/voucherify/src`.
- `std-toolkit/package.json` (post-Task-1) — `exports` to verify each rewritten specifier resolves.
- `/Users/kishorepolamarasetty/CAREER/MINE/private-monorepo/pnpm-workspace.yaml` — confirm it's a separate workspace (a `file:` dep is correct, not `workspace:*`).

**Interface produced.**

- voucherify depending on the umbrella via `"std-toolkit":"file:../../../monorepo/std-toolkit"` (external change).

**Inputs from predecessors.** Task `Collapse the five packages into the std-toolkit umbrella` must have produced a built `std-toolkit/dist/` — the `file:` install resolves `exports` to `dist`, so run `pnpm --filter std-toolkit build` in the monorepo before installing in voucherify.

**Out of scope.**

- Only `/Users/kishorepolamarasetty/CAREER/MINE/private-monorepo/apps/voucherify/**`. Do not modify anything else in the private monorepo or the public monorepo.

**Acceptance criteria.**

- [ ] voucherify `package.json` has exactly one toolkit dep: `"std-toolkit":"file:../../../monorepo/std-toolkit"`; the stale `@std-toolkit/tanstack` and the other four are gone.
- [ ] No `@std-toolkit/` specifier remains in voucherify `src`; `db-dynamodb` imports now read `std-toolkit/dynamodb`.
- [ ] `pnpm install` in voucherify resolves `std-toolkit` and its typecheck (`tsc --noEmit` / the app's check script) passes.

**Done when.** voucherify installs the single `file:` dep and typechecks against `std-toolkit/*` subpaths with no `@std-toolkit/` specifier remaining.
