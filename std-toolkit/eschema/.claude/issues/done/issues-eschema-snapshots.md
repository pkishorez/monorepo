# Issues: eschema-snapshots

Source: `this conversation`
Repo root: `/Users/kishorepolamarasetty/CAREER/MINE/monorepo/std-toolkit/eschema`
Project commands: `pnpm test` · `pnpm lint` · `pnpm build` · `pnpm build && node dist/cli/index.js --help`

## North Star

We are building a source-level snapshot workflow for `@std-toolkit/eschema` so users cannot accidentally mutate older schema version files after explicit approval. Schemas live under a CLI-supplied root, each schema root uses `schema.ts`, `versions/vN.ts`, raw `__snapshots__/vN.ts.snap` files, and `snapshots.json` as the committed approval record. The constraint we will not violate is file-local snapshotting: no transitive import hashing, no semantic schema introspection, and no AST-heavy evolve-chain validation. Good looks like `e-schema lint --root <dir>` failing in CI with clear status and diffs when a version is new, modified, deleted, or structurally invalid.

## Glossary

- **Schema collection root** - The directory passed with `--root`; all snapshot-managed schema roots live somewhere below it.
- **Schema root** - A directory under the schema collection root that contains at least one of `schema.ts`, `versions/`, `snapshots.json`, or `__snapshots__/`.
- **Version file** - A file named `versions/vN.ts`, where `N` is a positive integer and the file contains a textual `export const vN`.
- **Snapshot file** - The raw approved copy of a version file at `__snapshots__/vN.ts.snap`.
- **Snapshot manifest** - The committed `snapshots.json` file in a schema root. Its shape is a JSON object whose keys are version ids and whose values are `sha256-...` hashes of the corresponding snapshot file contents.
- **Latest version** - The highest contiguous `vN.ts` version file in a schema root.
- **Approved version** - A version whose `versions/vN.ts` content equals `__snapshots__/vN.ts.snap` and whose manifest hash equals the SHA-256 hash of that snapshot file.

## Conventions

- Follow the package instructions from the conversation: files are kebab-case only, comments only when necessary, and JSDoc is allowed for functions/classes/complex data structures.
- Keep all new CLI implementation code under `src/cli/**` so it does not collide with the existing eschema runtime modules.
- Use Effect CLI via `effect/unstable/cli`; do not add Commander, Yargs, CAC, or another CLI framework.
- Use the vendored `repos/effect-smol` only as read-only reference material. Do not edit it and do not import from it.
- Snapshot validation is intentionally file-level. Do not parse TypeScript ASTs, do not inspect `ESchema.evolve()` calls, do not hash transitive imports, and do not derive semantic schema descriptors.
- `index.ts` inside a schema root is scaffolded by `init`, but is user-owned after creation. `lint` and `snapshot` must not validate or modify schema-root `index.ts` files.
- The package uses Vitest. Current tests live in `src/__tests__/**/*.test.ts`, and `vite.config.ts` also includes `vtest/features/**/tests/**/*.test.ts`.

---

## Task: Snapshot Analyzer Core [AFK]

**Why.** This slice creates the file-level engine that makes old schema versions immutable after approval. It serves the North Star by detecting new, modified, deleted, malformed, and hash-mismatched version snapshots without involving CLI rendering or interactivity.

**What.** Add a pure analyzer module under `src/cli/snapshots/` that scans a schema collection root and returns a structured report for every schema root. It must discover schema roots recursively under `--root`, validate `schema.ts`, `versions/`, `snapshots.json`, `__snapshots__/`, version continuity, textual exports, snapshot file equality, and manifest hashes.

**Read first.**

- `src/eschema.ts` - current `ESchema.make(...).evolve(...).build()` API that generated version files will use.
- `src/types.ts` - exported type helpers such as `ESchemaType`, useful for the later `init` scaffold.
- `src/index.ts` - package public export style and path conventions.
- `src/__tests__/evolve.test.ts` - Vitest style for version-chain behavior tests.
- `package.json` - scripts, dependencies, and build output expectations.
- `tsconfig.json` - `rootDir: ./src`, `outDir: ./dist`, NodeNext module settings.
- `docs/adr/0001-unstamped-data-decodes-as-earliest-version.md` - why historical `v1` data must remain stable.

**Interface produced.**

- `src/cli/snapshots/analyze.ts` exports `analyzeSnapshots(root: string): SnapshotReport`.
- `src/cli/snapshots/model.ts` exports:
  - `type SnapshotReport = { readonly root: string; readonly schemas: readonly SchemaSnapshotReport[]; readonly issues: readonly SnapshotIssue[] }`
  - `type SchemaSnapshotReport = { readonly path: string; readonly relativePath: string; readonly latestVersion: string | null; readonly versions: readonly VersionSnapshotReport[]; readonly issues: readonly SnapshotIssue[] }`
  - `type VersionSnapshotReport = { readonly version: string; readonly versionFile: string; readonly snapshotFile: string; readonly status: "approved" | "new" | "modified" | "missing-file" | "hash-mismatch" | "invalid" }`
  - `type SnapshotIssue` with explicit `_tag` values: `MissingSchemaFile`, `MissingVersionsDirectory`, `InvalidVersionFilename`, `NonContiguousVersions`, `MissingVersionExport`, `SchemaDoesNotBuildLatest`, `InvalidSnapshotsJson`, `NewVersion`, `MissingSnapshotFile`, `SnapshotHashMismatch`, `ModifiedVersion`, `MissingVersionFile`, and `OrphanSnapshotFile`.
- `src/cli/snapshots/hash.ts` exports `hashSnapshotContent(content: string): string`, returning a string formatted as `sha256-<hex>`.
- `src/cli/snapshots/diff.ts` exports `formatUnifiedDiff(expectedLabel: string, expected: string, actualLabel: string, actual: string): string`.

**Inputs from predecessors.** None - can start immediately.

**Out of scope.**

- Do not add CLI commands; task `Effect CLI Shell And Lint` owns `src/cli/index.ts` and command wiring.
- Do not write snapshots or manifests; task `Interactive Snapshot Approval` owns approval writes.
- Do not create schema scaffolds; task `Init Scaffolding Command` owns generated files.
- Do not validate schema-root `index.ts`; the user explicitly made that file user-owned.
- Do not add AST parsing or semantic schema introspection.

**Acceptance criteria.**

- [ ] `analyzeSnapshots(root)` treats nested grouping folders as allowed and discovers schema roots recursively when a directory contains `schema.ts`, `versions/`, `snapshots.json`, or `__snapshots__/`.
- [ ] A valid schema root with `schema.ts`, contiguous `versions/v1.ts...vN.ts`, matching raw snapshot files, and a simple `snapshots.json` map returns no issues.
- [ ] Missing `schema.ts`, missing `versions/`, invalid version file names, version gaps, missing `export const vN`, and a `schema.ts` without textual `export const schema = vN.build()` for latest produce the matching structural issues.
- [ ] A version file with no manifest entry or no snapshot is reported as `NewVersion` or `MissingSnapshotFile`.
- [ ] A version file whose content differs from `__snapshots__/vN.ts.snap` is reported as `ModifiedVersion` and includes enough file/content data for CLI rendering to print a diff.
- [ ] A manifest hash that does not equal `hashSnapshotContent(snapshotFileContent)` is reported as `SnapshotHashMismatch`.
- [ ] A manifest or snapshot entry for a missing version file is reported as `MissingVersionFile` or `OrphanSnapshotFile`.
- [ ] Tests cover clean, new, modified, missing-file, hash-mismatch, invalid structure, nested grouping, and schema.ts latest-build cases.

**Done when.** Tests in `src/__tests__/snapshot-analyzer.test.ts` pass and `pnpm test -- src/__tests__/snapshot-analyzer.test.ts` succeeds.

---

## Task: Effect CLI Shell And Lint [AFK]

**Why.** This slice exposes the analyzer as the CI-facing command users will run to prevent accidental schema history mutations. It serves the North Star by making `e-schema lint --root <dir>` fail non-interactively with clear grouped status and diffs.

**What.** Add the `e-schema` executable under `src/cli/**`, wire it with `effect/unstable/cli`, add package `bin` metadata, and implement the `lint` command. The command must require `--root`, call `analyzeSnapshots(root)`, print a useful grouped report for all schemas and versions, include diffs for modified version files, and exit nonzero when any issue exists.

**Read first.**

- `src/cli/snapshots/analyze.ts` - produced by task `Snapshot Analyzer Core`; this command consumes `analyzeSnapshots(root)`.
- `src/cli/snapshots/model.ts` - produced by task `Snapshot Analyzer Core`; this command renders `SnapshotReport` and `SnapshotIssue`.
- `package.json` - add the `bin` entry and CLI/runtime dependencies here.
- `tsconfig.json` - confirms `src/cli/index.ts` emits to `dist/cli/index.js`.
- `/Users/kishorepolamarasetty/CAREER/MINE/monorepo/packages/monoverse/src/cli/index.ts` - local Effect CLI and `NodeRuntime.runMain` pattern.
- `/Users/kishorepolamarasetty/CAREER/MINE/monorepo/packages/monoverse/src/cli/commands/lint.ts` - local example of command output and nonzero failure.
- `/Users/kishorepolamarasetty/CAREER/MINE/monorepo/repos/effect-smol/ai-docs/src/70_cli/10_basics.ts` - read-only Effect CLI reference for `Command`, `Flag`, and required flags.

**Interface produced.**

- `package.json` contains `"bin": { "e-schema": "./dist/cli/index.js" }`.
- `package.json` includes `@effect/platform-node` as a dependency, with the same beta version as the existing `effect` dependency unless the workspace already pins a compatible version.
- `src/cli/index.ts` is the executable entrypoint and builds a root `Command.make("e-schema")` with subcommands.
- `src/cli/commands/lint.ts` exports `lintCommand`.
- CLI contract: `e-schema lint --root <schemas-root>`.
- `lint` returns exit code `0` when the analyzer report has no issues and exit code `1` when any issue exists.

**Inputs from predecessors.** Task `Snapshot Analyzer Core` produces `analyzeSnapshots(root: string): SnapshotReport` at `src/cli/snapshots/analyze.ts` and the report/issue types at `src/cli/snapshots/model.ts`. Call that function directly from `lintCommand`.

**Out of scope.**

- Do not implement `init`; task `Init Scaffolding Command` owns `src/cli/commands/init.ts`.
- Do not implement interactive snapshot approval; task `Interactive Snapshot Approval` owns `src/cli/commands/snapshot.ts`.
- Do not modify the existing eschema runtime exports in `src/index.ts`; the CLI is exposed through `package.json` `bin`, not the library entrypoint.
- Do not validate schema-root `index.ts`.

**Acceptance criteria.**

- [ ] `e-schema lint --root <schemas-root>` is implemented using `effect/unstable/cli`, not a different CLI library.
- [ ] Omitting `--root` fails through the CLI parser; there is no default root.
- [ ] Clean output includes each discovered schema root, latest version, per-version status, and a final success line.
- [ ] Failing output includes each discovered schema root, latest version when known, every issue, and a final failure line.
- [ ] Modified files include a unified diff generated from the analyzer's approved snapshot content and current version content.
- [ ] The command exits nonzero in CI-style execution when the analyzer report contains any issue.
- [ ] `pnpm build` emits `dist/cli/index.js`, and `node dist/cli/index.js --help` shows `lint` as a subcommand.
- [ ] Tests cover clean lint exit/output and failing lint exit/output. The tests may call the command handler/formatter directly rather than spawning a child process.

**Done when.** `pnpm build` succeeds and `node dist/cli/index.js lint --root <fixture-root>` exits `0` for a clean fixture and `1` for a fixture with a modified version file.

---

## Task: Init Scaffolding Command [AFK]

**Why.** This slice gives users a reliable way to create the strict folder structure without hand-copying files. It serves the North Star by creating schema roots that are intentionally unapproved until the user explicitly runs the interactive snapshot command.

**What.** Add `e-schema init --root <schemas-root> <schema-path>` under `src/cli/**`. It creates a plain `ESchema` schema root with `index.ts`, `schema.ts`, and `versions/v1.ts`, but does not create `snapshots.json` or `__snapshots__/v1.ts.snap`.

**Read first.**

- `src/eschema.ts` - current plain `ESchema.make({...}).build()` API used in the scaffold.
- `src/types.ts` - `ESchemaType` used by the generated `index.ts`.
- `src/index.ts` - public import surface for generated code.
- `package.json` - confirm the CLI entrypoint created by task `Effect CLI Shell And Lint`.
- `src/cli/index.ts` - produced by task `Effect CLI Shell And Lint`; add the `init` subcommand to this root command.
- `/Users/kishorepolamarasetty/CAREER/MINE/monorepo/repos/effect-smol/ai-docs/src/70_cli/10_basics.ts` - read-only Effect CLI reference for string arguments and flags.

**Interface produced.**

- `src/cli/commands/init.ts` exports `initCommand`.
- CLI contract: `e-schema init --root <schemas-root> <schema-path>`.
- `<schema-path>` supports nested grouping paths such as `identity/user-profile`; path traversal with `..`, absolute paths, and empty segments are rejected.
- Generated `schema.ts` content:

  ```ts
  import { v1 } from './versions/v1.js';

  export const schema = v1.build();
  ```

- Generated `versions/v1.ts` content:

  ```ts
  import { Schema } from 'effect';
  import { ESchema } from '@std-toolkit/eschema';

  export const v1 = ESchema.make({
    name: Schema.String,
  });
  ```

- Generated `index.ts` content for final segment `user-profile`:

  ```ts
  import type { ESchemaType } from '@std-toolkit/eschema';
  import { schema } from './schema.js';

  export { schema as userProfileSchema };

  export type UserProfile = ESchemaType<typeof schema>;
  ```

**Inputs from predecessors.** Task `Effect CLI Shell And Lint` produces `src/cli/index.ts` and the root `e-schema` command. Register `initCommand` there.

**Out of scope.**

- Do not scaffold `SingleEntityESchema`, `EntityESchema`, or `ValueESchema`; the first version supports plain `ESchema` only.
- Do not create `snapshots.json` or `__snapshots__/`; approval must happen through `e-schema snapshot`.
- Do not enforce or later validate schema-root `index.ts`.
- Do not add semantic checks for the generated version file beyond the analyzer's textual rules.

**Acceptance criteria.**

- [ ] `e-schema init --root <tmp>/schemas user-profile` creates `user-profile/index.ts`, `user-profile/schema.ts`, and `user-profile/versions/v1.ts`.
- [ ] `e-schema init --root <tmp>/schemas identity/user-profile` creates the same schema root under `identity/user-profile`.
- [ ] Generated `index.ts` derives `userProfileSchema` and `UserProfile` from the final folder segment.
- [ ] The command fails without modifying existing files when the target directory already exists and is non-empty.
- [ ] The command rejects absolute schema paths, `..`, and empty path segments.
- [ ] Running `e-schema lint --root <tmp>/schemas` after init reports `v1` as new/unapproved rather than clean.
- [ ] Tests cover flat path, nested path, name derivation, existing target, invalid path, and unapproved lint status after init.

**Done when.** `pnpm test -- src/__tests__/snapshot-init.test.ts` passes and `node dist/cli/index.js init --root <tmp-root> user-profile` creates the documented scaffold after `pnpm build`.

---

## Task: Interactive Snapshot Approval [AFK]

**Why.** This slice implements the explicit human approval step that turns new or intentionally changed version files into committed snapshots. It serves the North Star by requiring a deliberate per-version decision before `lint` becomes green.

**What.** Add `e-schema snapshot --root <schemas-root> [--force]` as an interactive command under `src/cli/**`. It scans the same report as `lint`, walks actionable version issues one by one, shows the violation and a diff when relevant, and asks the user to `approve` or `ignore`.

**Read first.**

- `src/cli/snapshots/analyze.ts` - produced by task `Snapshot Analyzer Core`; this command uses the same analyzer report as `lint`.
- `src/cli/snapshots/hash.ts` - produced by task `Snapshot Analyzer Core`; approval uses `hashSnapshotContent` after writing the `.snap` file.
- `src/cli/snapshots/model.ts` - produced by task `Snapshot Analyzer Core`; approval decides which issue tags are actionable.
- `src/cli/commands/lint.ts` - produced by task `Effect CLI Shell And Lint`; reuse the same report/diff formatting where possible.
- `src/cli/index.ts` - produced by task `Effect CLI Shell And Lint`; add the `snapshot` subcommand to this root command.
- `package.json` - confirm build/bin behavior.

**Interface produced.**

- `src/cli/commands/snapshot.ts` exports `snapshotCommand`.
- CLI contract: `e-schema snapshot --root <schemas-root> [--force]`.
- `src/cli/snapshots/approve.ts` exports `approveVersionSnapshot(input: { readonly schemaRoot: string; readonly version: string }): Effect.Effect<void, SnapshotApprovalError>`.
- Approval writes raw current `versions/vN.ts` content into `__snapshots__/vN.ts.snap`, computes the hash from the snapshot file content, and updates `snapshots.json` as a simple JSON object map: `{ "v1": "sha256-..." }`.
- `snapshot` prompts per version, never per schema root as a bulk action.

**Inputs from predecessors.** Task `Snapshot Analyzer Core` produces `analyzeSnapshots(root: string): SnapshotReport`, `hashSnapshotContent(content: string): string`, and issue tags. Task `Effect CLI Shell And Lint` produces the CLI root in `src/cli/index.ts`. Register `snapshotCommand` there.

**Out of scope.**

- Do not auto-approve or auto-delete missing/deleted version files. Report them only.
- Do not approve modified non-latest versions unless `--force` is present.
- Do not alter schema-root `index.ts`.
- Do not add semantic evolve-chain validation.
- Do not preserve custom whitespace in `snapshots.json`; the command may rewrite JSON through `JSON.stringify`, and lint must parse JSON rather than compare manifest formatting.

**Acceptance criteria.**

- [ ] For a new latest version, choosing `approve` creates `__snapshots__/vN.ts.snap`, writes raw version-file content, creates or updates `snapshots.json`, and makes `e-schema lint --root <schemas-root>` clean for that version.
- [ ] For a new version, choosing `ignore` writes nothing and leaves `lint` failing.
- [ ] For a modified latest version, the prompt shows a diff; choosing `approve` replaces the snapshot file with current version content and updates the manifest hash.
- [ ] For a modified non-latest version without `--force`, the command shows the violation and diff but does not offer approval.
- [ ] For a modified non-latest version with `--force`, choosing `approve` updates the snapshot and manifest hash.
- [ ] For a missing/deleted version file referenced by `snapshots.json` or `__snapshots__`, the command reports the problem and writes nothing.
- [ ] The prompt accepts `approve`, `a`, `ignore`, and `i`; invalid answers re-prompt for the same version.
- [ ] Tests cover new approve, new ignore, latest modified approve, non-latest blocked, non-latest force approve, missing/deleted report-only, and invalid prompt answer.

**Done when.** `pnpm test -- src/__tests__/snapshot-approval.test.ts` passes and a manual `node dist/cli/index.js snapshot --root <fixture-root>` can approve a new `v1` fixture so that subsequent `node dist/cli/index.js lint --root <fixture-root>` exits `0`.

---

## Task: Snapshot Workflow Docs [AFK]

**Why.** This slice makes the workflow discoverable to users who know the existing `ESchema.make(...).evolve(...).build()` model but do not know the file-level approval convention. It serves the North Star by documenting the exact folder structure, CLI commands, and approval lifecycle that CI enforces.

**What.** Update package documentation to describe schema snapshotting, the `e-schema` CLI, the strict machine-facing files, and the user-owned `index.ts` scaffold. The docs must show the settled command hierarchy and a complete example from init to approval to lint.

**Read first.**

- `README.md` - main package documentation to update.
- `docs/adr/0001-unstamped-data-decodes-as-earliest-version.md` - current rationale for frozen earliest versions.
- `docs/adr/0002-value-eschema-uses-versioned-envelope.md` - composition/value schema context; mention that the initial `init` command scaffolds only plain `ESchema`.
- `src/cli/commands/init.ts` - produced by task `Init Scaffolding Command`; document generated files exactly.
- `src/cli/commands/lint.ts` - produced by task `Effect CLI Shell And Lint`; document CI behavior exactly.
- `src/cli/commands/snapshot.ts` - produced by task `Interactive Snapshot Approval`; document approval behavior exactly.
- `package.json` - confirm the executable name is `e-schema`.

**Interface produced.**

- `README.md` contains a section titled `## Schema snapshots`.
- The docs list exactly these commands:
  - `e-schema init --root <schemas-root> <schema-path>`
  - `e-schema lint --root <schemas-root>`
  - `e-schema snapshot --root <schemas-root> [--force]`
- The docs show a schema root with `index.ts`, `schema.ts`, `versions/v1.ts`, `__snapshots__/v1.ts.snap`, and `snapshots.json`.

**Inputs from predecessors.** Tasks `Effect CLI Shell And Lint`, `Init Scaffolding Command`, and `Interactive Snapshot Approval` produce the command contracts and generated file contents that this task documents.

**Out of scope.**

- Do not add vtest docs unless the implementation tasks already introduced a vtest topic; this task only needs the package README.
- Do not document unsupported init variants for `SingleEntityESchema`, `EntityESchema`, or `ValueESchema`.
- Do not describe transitive import hashing, semantic descriptors, or AST-based evolve validation.

**Acceptance criteria.**

- [ ] README explains that source snapshots protect local version files from accidental mutation after explicit approval.
- [ ] README states that `--root` is always required and there is no default schema root.
- [ ] README states that nested schema grouping paths such as `identity/user-profile` are supported.
- [ ] README states that `schema.ts` is machine-facing and must export `const schema = latest.build()`.
- [ ] README states that `index.ts` is scaffolded but user-owned and not validated by `lint` or `snapshot`.
- [ ] README states that `snapshots.json` is a simple version-to-hash map and that `.snap` files contain raw approved source content without a generated header.
- [ ] README states that non-latest modifications require `e-schema snapshot --root <schemas-root> --force`.
- [ ] README shows `e-schema lint --root <schemas-root>` as the CI command.

**Done when.** `README.md` contains the `## Schema snapshots` section and `pnpm lint` succeeds.
