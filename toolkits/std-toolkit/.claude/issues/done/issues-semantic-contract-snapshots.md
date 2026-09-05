# Issues: semantic-contract-snapshots

Source: this conversation
Repo root: /Users/kishorepolamarasetty/CAREER/MINE/monorepo__worktrees/feat-std-toolkit-studio/std-toolkit
Project commands: pnpm test · pnpm lint · pnpm lint:depcruise · pnpm build

## North Star

std-toolkit will let users change ESchemas and database tables confidently by emitting opt-in semantic snapshots of persisted data contracts instead of tracking source files. The current application only needs to read every historical record and always writes the latest version; migration functions themselves are not snapshot material. The constraint we slip scope before violating is honesty: when runtime behavior cannot be represented or verified, preserve both data sides and report it as unverifiable rather than claiming safety. Good looks like deterministic JSON and readable Vitest output where nested evolution is visible, every table adapter produces one normalized contract, and each historical change carries its own useful classification.

## Glossary

- **ESchema snapshot** — a JSON-safe description of every ESchema version on its encoded and decoded sides, with nested ESchemas stored once under stable identities.
- **Table snapshot** — a JSON-safe description of an adapter's logical storage contract: physical indexes, registered entities, ESchema histories, and entity index derivations.
- **Approved version** — an ESchema version present in a stored baseline; both encoded and decoded contracts are frozen.
- **Transitive change** — a parent-visible change caused by a nested ESchema evolving without a parent version change.
- **Snapshot diagnostic** — a current-state limitation, such as a custom transformation whose behavior cannot be verified from serializable data.
- **Snapshot change** — one difference between two snapshots, independently classified as safe, requires-backfill, breaking, or unverifiable.
- **Snapshot identity** — the stable name of one ESchema definition; one object may be referenced many times, while distinct objects must have distinct identities.

## Conventions

- Read docs/adr/0001-semantic-contract-snapshots.md, src/eschema/CONTEXT.md, and src/db/CONTEXT.md before every task.
- Files are kebab-case. Comments are only for non-obvious constraints; public functions, classes, and complex data structures receive concise JSDoc.
- repos/effect-smol is read-only reference material and is absent from this worktree. Never edit it or import from it.
- Effect is 4.0.0-beta.78. Read installed sources under node_modules/effect for SchemaRepresentation, SchemaAST, SchemaTransformation, Schema.toEncoded, and Schema.toType behavior.
- Tests use Vitest in colocated **tests** directories. Effectful tests use Effect.runPromise; reserve Effect.runSync for tests and scripts.
- Snapshot creation, inspection, comparison, and rendering are synchronous and pure. Only decoding unknown stored JSON is Effectful.
- Canonical JSON is the machine contract. Human-readable rendering is deterministic derived output and is never parsed.
- Snapshot storage, baseline approval, CI policy, deployment policy, and UI verdict aggregation belong to consumers, not std-toolkit.

---

## Task: Semantic ESchema snapshots [AFK]

**Why.** Users need a small, truthful artifact that freezes every approved encoded and decoded data contract without preserving source files. This slice also makes nested ESchema evolution observable while keeping each child independently versioned.

**What.** Add the public std-toolkit/snapshot module and synchronous snapshot() methods to ESchema, SingleEntityESchema, EntityESchema, and ValueESchema. Deliver the complete ESchema path end to end: JSON-safe Effect Schema representations, nested-definition references, snapshot-format decoding, current diagnostics, historical diffing, domain-oriented rendering, public exports, and tests.

**Read first.**

- docs/adr/0001-semantic-contract-snapshots.md — binding architecture and classification policy.
- src/eschema/eschema.ts and src/eschema/internal/builders.ts — all four ESchema variants, private evolution history, and toSchema composition.
- src/eschema/types.ts, src/eschema/schema.ts, and src/eschema/index.ts — current type vocabulary and public barrel.
- src/eschema/**tests**/composition.test.ts, src/eschema/**tests**/value-eschema.test.ts, and src/eschema/**tests**/descriptor.test.ts — nesting, value envelopes, transforms, and test style.
- node_modules/effect/src/SchemaRepresentation.ts, node_modules/effect/src/SchemaTransformation.ts, node_modules/effect/src/SchemaAST.ts, and node_modules/effect/src/Schema.ts — representation JSON encoding, stable transformation singletons, AST links, and encoded/type projection.
- package.json, vite.config.ts, depcruise.config.ts, and laymos.config.ts — subpath export, test discovery, and module-boundary configuration.

**Interface produced.**

- package.json exports std-toolkit/snapshot from src/snapshot/index.ts.
- Every ESchema variant exposes synchronous snapshot(): ESchemaSnapshot. Named entity variants use their entity name as root identity; an anonymous top-level ESchema or ValueESchema uses the reserved identity $root.
- src/snapshot/index.ts exports Snapshot, ContractSnapshot, ESchemaSnapshot, ESchemaDefinition, SnapshotChange, SnapshotDiagnostic, SnapshotClassification, SnapshotDecodeError, and SnapshotIdentityConflict.
- Snapshot.decode(input: unknown): Effect.Effect<ContractSnapshot, SnapshotDecodeError> accepts parsed JSON values, validates them, and migrates older snapshot-format versions.
- Snapshot.inspect(snapshot: ContractSnapshot): readonly SnapshotDiagnostic[] is synchronous and derives current limitations from markers stored in the snapshot.
- Snapshot.diff(previous: ContractSnapshot, current: ContractSnapshot): readonly SnapshotChange[] is synchronous and returns changes ordered by path and then kind.
- Snapshot.render(snapshot: ContractSnapshot): string produces stable domain-oriented text, not pretty JSON.
- Snapshot.renderChanges(changes: readonly SnapshotChange[]): string produces stable review text.
- SnapshotChange has exactly path, scope, kind, classification, message, and optional before/after fields. path is an RFC 6901 JSON Pointer string. classification is safe | requires-backfill | breaking | unverifiable. scope is snapshot | eschema | table | entity | index.
- src/snapshot/internal/eschema-snapshot.ts exposes an internal graph builder that accepts multiple ESchema roots and returns deduplicated ESchemaDefinition values; task 2 consumes it without importing adapter classes into the snapshot module.

**Binding data contract.**

- ESchemaSnapshot is {_v: 'v1', kind: 'eschema', root: string, schemas: readonly ESchemaDefinition[]}.
- Each ESchemaDefinition contains identity, kind (struct | value | entity | single-entity), idField as string or null, and ordered versions.
- Each version contains its version tag, a JSON-safe encoded representation, a JSON-safe decoded representation, named verifiable transformations, and stored unverifiable markers.
- Struct encoded representations include that historical version's _v literal; struct decoded representations omit _v. Value encoded representations are {_v, value}; value decoded representations are the raw value.
- Build the two sides through Schema.toEncoded and Schema.toType, convert with SchemaRepresentation.fromAST, and encode with SchemaRepresentation.DocumentFromJson. Never store raw representation objects.
- Extend the JSON representation with {_tag: 'ESchemaRef', identity: string}. Replace a registered nested toSchema AST node with this node instead of expanding the child shape. All external references must resolve to exactly one definition.
- Sort definitions and struct fields by stable identity. Preserve version order, tuple order, union order, and every other order that can affect decoding. Recursively canonicalize object keys and remove presentation annotations including title, description, examples, default, expected, generation, and format.
- Define the snapshot document's v1 shape with an internal ESchema. Do not call snapshot() on that internal ESchema. Constructing current _v is synchronous; Snapshot.decode uses its Effectful decode path.

**Binding identity and AST rules.**

- Add private composition metadata for every toSchema result, using an internal WeakMap or symbol keyed by the returned AST. Record the child ESchema object and resolved composition name because the current Effect AST retains only an identifier and opaque closure.
- Traverse every historical evolution, not only the latest schema. Add a narrow internal evolution accessor; never expose, execute, hash, render, or serialize migration functions.
- The same ESchema object reused under the same identity is stored once and may have any number of references.
- Distinct ESchema objects claiming one identity throw synchronous SnapshotIdentityConflict, even when their current shapes match. One object used through different explicit toSchema names also throws.
- Anonymous nested ESchemas still require toSchema(child, {name: 'StableName'}). The reserved $root identity applies only to a directly snapshotted anonymous root.
- The transform inserted by toSchema is std-toolkit composition plumbing and never produces an unverifiable diagnostic.
- Snapshot.decode rejects duplicate identities, dangling ESchemaRef nodes, malformed versions, and non-contiguous version histories with SnapshotDecodeError.

**Binding verifiability rules.**

- Traverse the original AST separately because SchemaRepresentation intentionally erases transformation identity.
- Recognize transformations only by reference equality against an explicit allowlist of stable public SchemaTransformation singletons. Include numberFromString, bigintFromString, dateFromString, dateFromMillis, durationFromString, durationFromNanos, durationFromMillis, urlFromString, bigDecimalFromString, uint8ArrayFromBase64String, stringFromBase64String, stringFromBase64UrlString, stringFromHexString, stringFromUriComponent, fromJsonString, fromFormData, fromURLSearchParams, timeZoneNamedFromString, timeZoneFromString, dateTimeUtcFromString, and dateTimeZonedFromString when those exports exist in the installed Effect version.
- Never infer identity from function names or source text. Factory-created and custom transforms are unverifiable.
- Preserve built-in declarations only when their stable typeConstructor metadata is serializable. Custom declarations, custom filters that SchemaRepresentation drops, middleware, and default-producing runtime behavior produce stored unverifiable markers.
- A custom transform still stores both encoded and decoded representations. Snapshot.inspect reports it on every call. If unchanged between baselines it creates no Snapshot.diff change.

**Binding diff and render rules.**

- Appending exactly the next version is safe. Inserting a historical version is breaking.
- Deleting an approved version is breaking.
- Changing an approved encoded side and changing an approved decoded side are separate breaking changes so a UI can point at the precise contract.
- Adding a nested version emits its safe child-version change plus deterministic safe transitive changes for every ancestor that references it; no ancestor version bump is required.
- Introducing or removing unverifiable behavior emits an unverifiable change while the current marker remains available through inspect.
- Migration-only changes and presentation-only annotation changes produce no changes.
- Comparing different snapshot kinds emits exactly one unverifiable snapshot-kind change and stops.
- render includes identities, versions, encoded and decoded sides, ESchemaRef nodes, and unverifiable markers with stable indentation. renderChanges includes classification, path, and message in diff order.

**Inputs from predecessors.** None — can start immediately.

**Out of scope.**

- Do not add TableSnapshot or modify database adapters; task 2 owns that slice.
- Do not store or approve baselines, add a status API, add CI policy, or build a UI.
- Do not remove src/eschema/cli or edit README files; task 5 owns removal and workflow documentation.
- Do not make migrations part of snapshots or diagnostics.

**Acceptance criteria.**

- [ ] src/snapshot/**tests**/eschema-snapshot.test.ts proves every version is captured with correct struct/value encoded and decoded sides; all four ESchema variants expose snapshot(); JSON.stringify works and decode(JSON.parse(JSON.stringify(snapshot))) round-trips.
- [ ] The snapshot test includes bigint literals, built-in Date/URL declarations, one allowlisted transform with no diagnostic, a custom transform with both sides plus a diagnostic, and custom filter/declaration cases that cannot silently appear verifiable.
- [ ] The same child object used in two fields appears once with two ESchemaRef nodes; adding child v2 creates one safe addition and safe transitive ancestor changes without a parent version bump.
- [ ] Distinct schemas sharing an identity and one schema used under conflicting names throw SnapshotIdentityConflict; decode rejects duplicate definitions and dangling references.
- [ ] src/snapshot/**tests**/snapshot-diff.test.ts proves next-version addition, approved encoded edit, approved decoded edit, version deletion, unchanged custom transform, migration-only change, cosmetic-only change, and deterministic path/kind ordering.
- [ ] src/snapshot/**tests**/snapshot-render.test.ts pins readable domain text for a nested schema and readable ordered changes.
- [ ] Reordering schema definitions and struct fields leaves canonical JSON and rendering equal; version, tuple, union, and dependency order are not sorted.
- [ ] pnpm exec vitest run src/snapshot/**tests**/eschema-snapshot.test.ts src/snapshot/**tests**/snapshot-diff.test.ts src/snapshot/**tests**/snapshot-render.test.ts succeeds.
- [ ] pnpm lint, pnpm lint:depcruise, pnpm test, and pnpm build succeed.

**Done when.** The focused snapshot tests pass through the public std-toolkit/snapshot and ESchema.snapshot() interfaces, and all four project commands succeed.

---

## Task: DynamoDB total table snapshots [AFK]

**Why.** An ESchema-only baseline cannot detect production risks caused by physical key topology or entity derivations. This slice establishes the normalized database-agnostic table contract and proves it through the DynamoDB adapter.

**What.** Extend std-toolkit/snapshot with TableSnapshot, table validation, table inspection/diff/render dispatch, and shared table-construction helpers. Add synchronous DynamoTable.snapshot() that retains every built entity and captures physical indexes, entity kind/id field, ESchema definitions, and ordered index derivations without requiring a DynamoDB connection.

**Read first.**

- src/snapshot/index.ts and src/snapshot/internal/eschema-snapshot.ts — task 1's public operations and multi-root ESchema graph builder.
- src/db/dynamodb/services/dynamo-table.ts — topology builder, entity registration, and getTableSchema physical-index behavior.
- src/db/dynamodb/services/dynamo-entity.ts — private ESchema, primary derivation, secondary derivations, and semantic/physical index names.
- src/db/dynamodb/services/dynamo-single-entity.ts — singleton registration and runtime default value that snapshots must exclude.
- src/db/dynamodb/**tests**/index.test.ts and src/db/dynamodb/**tests**/single-entity.test.ts — pure table/entity construction and duplicate-name behavior.
- src/db/CONTEXT.md and src/db/dynamodb/CONTEXT.md — shared table vocabulary and DynamoDB-specific topology.

**Interface produced.**

- src/snapshot/index.ts additionally exports TableSnapshot, TableEntitySnapshot, TableIndexSnapshot, and TableEntitySnapshotSource; ContractSnapshot becomes ESchemaSnapshot | TableSnapshot.
- TableSnapshot is {_v: 'v1', kind: 'table', adapter, primaryIndex, secondaryIndexes, entities, schemas}.
- Table adapter is dynamodb | sqlite | idb.
- primaryIndex is {pk: string, sk: string}.
- secondaryIndexes is a name-sorted array of {name, kind, pk, sk}, where kind is gsi | lsi | secondary | sparse.
- entities is a name-sorted array of {name, kind, idField, schema, primaryDerivation, secondaryDerivations}. kind is keyed | singleton; idField is string | null; schema is an ESchema identity reference.
- primaryDerivation is {pk: readonly string[], sk: readonly string[]}. A singleton uses {pk: [], sk: []}.
- secondaryDerivations is a semantic-name-sorted array of {name, physicalIndex, pk: readonly string[], sk: readonly string[]}.
- src/snapshot/internal/table-snapshot.ts exports a package-private tableSnapshotSource symbol and createTableSnapshot(input): TableSnapshot. Entity services implement the symbol to return immutable TableEntitySnapshotSource data; adapters never expose mutable private derivation state.
- DynamoTable.snapshot(): TableSnapshot is synchronous and callable without DynamoDB, a table name, setup, or network access.
- Snapshot.decode, inspect, diff, render, and renderChanges dispatch on kind: 'table' using the same public signatures from task 1.

**Binding normalization rules.**

- DynamoDB adapter identity is dynamodb.
- Infer physical kind exactly as existing getTableSchema does: an index whose pk equals the primary pk is lsi; every other index is gsi. A builder call named gsi with the primary pk already becomes physical LSI topology and the snapshot must describe that outcome.
- Normalize Dynamo StoredIndexDerivation.gsiName to physicalIndex and entityIndexName to name.
- Preserve pk/sk dependency array order because it changes persisted derived key strings. Omit isTimelineSk because sk: ['_u'] contains the same information.
- Sort physical indexes, entities, and semantic derivations by name. Registration order produces identical snapshots.
- Retain actual built entity objects in DynamoTable in addition to enforcing duplicate names. Preserve the current duplicate failure timing at entity build or singleton default.
- Merge every registered entity's ESchema graph into one schemas array. Reuse of the same object/identity deduplicates; cross-entity identity conflicts throw SnapshotIdentityConflict.
- Singleton defaults, physical table name, connection, region, billing mode, row counts, table/index status, and runtime database state never enter the snapshot.

**Binding table validation and diff rules.**

- Snapshot.decode rejects dangling entity schema refs, duplicate entity/index identities, and entity secondary derivations that reference absent physical indexes before diff.
- Identical tables produce no changes.
- A primary pk or sk change is breaking.
- Adding or changing a secondary physical index requires-backfill. Removing one is safe when the current snapshot has no derivation referencing it; a retained dangling derivation is invalid, not a change.
- Adding an entity is safe. Removing one is breaking.
- For one retained entity, idField change, keyed/singleton change, or primary derivation change is breaking.
- Adding, changing fields of, or moving a secondary entity derivation requires-backfill. Removing one is safe. A semantic rename is represented as safe removal plus requires-backfill addition; do not infer renames.
- An entity rename naturally appears as breaking removal plus safe addition because no independent stable entity ID exists; do not infer renames.
- Delegate ESchema histories to task 1's diff rules, including safe nested transitive changes and breaking approved-version edits.
- Comparing different adapters emits exactly one unverifiable adapter change and stops all topology/entity comparison.
- Table changes use the same RFC 6901 paths and deterministic path-then-kind ordering.

**Inputs from predecessors.** Task Semantic ESchema snapshots produces src/snapshot/index.ts with Snapshot operations and ESchemaDefinition, plus src/snapshot/internal/eschema-snapshot.ts with the multi-root graph builder. Use those artifacts directly; never parse rendered text.

**Out of scope.**

- Do not modify SQLite or IndexedDB sources; tasks 3 and 4 own those adapters.
- Do not inspect live DynamoDB table state or implement backfill execution.
- Do not add approval storage, deployment enforcement, or an overall pass/fail verdict.
- Do not include singleton defaults.

**Acceptance criteria.**

- [ ] src/snapshot/**tests**/table-diff.test.ts proves identical, primary change, secondary add/change/remove, entity add/remove, idField change, kind change, primary derivation change, secondary derivation add/change/move/remove/rename, ESchema append/edit/delete, nested transitive change, adapter mismatch, invalid refs, and deterministic ordering.
- [ ] Adapter mismatch returns exactly one unverifiable change and no topology/entity noise.
- [ ] src/db/dynamodb/**tests**/snapshot.test.ts captures primary topology, one GSI, one LSI, a keyed entity with ordered primary/secondary derivations, and a singleton with null idField and empty derivations.
- [ ] Changing only a singleton default leaves the snapshot equal.
- [ ] Reversing entity registration order leaves the snapshot equal.
- [ ] Reusing one nested ESchema across entities stores one definition; distinct objects claiming one identity throw SnapshotIdentityConflict.
- [ ] DynamoTable.snapshot() tests require no layer, physical table, credentials, or network.
- [ ] src/db/dynamodb/README.md briefly documents table.snapshot() and links to the shared snapshot workflow that task 5 will place in src/eschema/README.md.
- [ ] pnpm exec vitest run src/snapshot/**tests**/table-diff.test.ts src/db/dynamodb/**tests**/snapshot.test.ts succeeds.
- [ ] pnpm lint, pnpm test, and pnpm build succeed.

**Done when.** The normalized table-diff suite and DynamoDB producer suite pass without external services, and the full project is green.

---

## Task: SQLite table snapshot producer [AFK]

**Why.** A unified UI can only trust the normalized contract if SQLite emits the same logical data as DynamoDB without leaking SQL runtime state.

**What.** Add synchronous snapshot() to the enriched SQLite table returned by SQLiteTable.build(). Retain built entity objects in the existing withEntityDefinitions closure and feed immutable descriptors into task 2's shared createTableSnapshot helper.

**Read first.**

- src/snapshot/index.ts and src/snapshot/internal/table-snapshot.ts — task 2's frozen normalized contract, symbol, and constructor.
- src/db/sqlite/services/sqlite-table.ts — createSQLiteTableInstance, withEntityDefinitions registration closure, and index builder.
- src/db/sqlite/services/sqlite-entity.ts — private ESchema and keyed derivation data.
- src/db/sqlite/services/sqlite-single-entity.ts — singleton default that must remain outside snapshots.
- src/db/sqlite/services/**tests**/entity.test.ts and src/db/sqlite/services/**tests**/single-entity.test.ts — construction fixtures and Effect test conventions.
- src/db/sqlite/CONTEXT.md — SQLite adapter boundaries.

**Interface produced.**

- The object returned by SQLiteTable.make().primary(...).index(...).build() exposes synchronous snapshot(): TableSnapshot.
- SQLiteEntity and SQLiteSingleEntity implement task 2's package-private tableSnapshotSource symbol and return TableEntitySnapshotSource.
- Existing SQLite public exports and CRUD signatures remain unchanged.

**Binding rules.**

- Adapter identity is sqlite; every physical secondary index kind is secondary.
- Normalize SQLite StoredIndexDerivation.indexName to physicalIndex and entityIndexName to name.
- Preserve primary and secondary pk/sk dependency array order.
- Singleton idField is null, primary derivation is {pk: [], sk: []}, secondary derivations are empty, and default values are excluded.
- Sort indexes, entities, and derivations through createTableSnapshot, not registration order.
- snapshot() is pure and must not request SqliteDB, call setup(), open a file, or execute SQL.

**Inputs from predecessors.** Task DynamoDB total table snapshots produces TableSnapshot and TableEntitySnapshotSource in src/snapshot/index.ts and createTableSnapshot plus tableSnapshotSource in src/snapshot/internal/table-snapshot.ts. Implement those exact internal interfaces; do not extend the normalized model.

**Out of scope.**

- Do not modify src/snapshot model, validation, diff, inspection, or rendering; task 2 owns them.
- Do not modify DynamoDB or IndexedDB sources.
- Do not snapshot a physical SQLite schema, table name, database path, connection, row count, or default singleton value.

**Acceptance criteria.**

- [ ] src/db/sqlite/services/**tests**/snapshot.test.ts captures adapter sqlite, primary topology, secondary kind, complete keyed entity derivations, singleton shape, and all ESchema definitions.
- [ ] Dependency array order is preserved while entity registration order is canonicalized.
- [ ] Changing only a singleton default leaves the snapshot equal.
- [ ] snapshot(), Snapshot.inspect(), and Snapshot.diff() run without a SqliteDB layer, setup, a database file, or SQL.
- [ ] src/db/sqlite/README.md briefly documents table.snapshot() and links to the shared snapshot workflow.
- [ ] pnpm exec vitest run src/db/sqlite/services/**tests**/snapshot.test.ts succeeds.
- [ ] pnpm lint, pnpm test, and pnpm build succeed.

**Done when.** The SQLite producer returns task 2's unchanged normalized TableSnapshot through a pure test, and the full project is green.

---

## Task: IndexedDB table snapshot producer [AFK]

**Why.** Browser consumers need the same contract and UI model as server adapters, while preserving the fact that IndexedDB compound indexes are sparse.

**What.** Add synchronous snapshot() to the enriched IndexedDB table returned by IdbTable.build(). Retain built entities in the existing withEntityDefinitions closure and feed immutable descriptors into task 2's shared createTableSnapshot helper.

**Read first.**

- src/snapshot/index.ts and src/snapshot/internal/table-snapshot.ts — task 2's frozen normalized contract, symbol, and constructor.
- src/db/idb/src/idb-table.ts — table builder, registration closure, and native index topology.
- src/db/idb/src/idb-entity.ts — private ESchema and keyed derivation data.
- src/db/idb/src/idb-single-entity.ts — singleton default that must remain outside snapshots.
- src/db/idb/**tests**/table-entities.test.ts and src/db/idb/**tests**/table.test.ts — pure construction, fake IndexedDB boundaries, and sparse-index behavior.
- src/db/idb/CONTEXT.md and src/db/idb/docs/adr/0001-auto-versioned-setup.md — IndexedDB topology and runtime ownership.

**Interface produced.**

- The object returned by IdbTable.make().primary(...).index(...).build() exposes synchronous snapshot(): TableSnapshot.
- IdbEntity and IdbSingleEntity implement task 2's package-private tableSnapshotSource symbol and return TableEntitySnapshotSource.
- Existing IndexedDB public exports and CRUD signatures remain unchanged.

**Binding rules.**

- Adapter identity is idb; every physical secondary index kind is sparse because native compound indexes omit records missing indexed fields.
- Normalize Idb StoredIndexDerivation.indexName to physicalIndex and entityIndexName to name.
- Preserve primary and secondary pk/sk dependency array order.
- Singleton idField is null, primary derivation is {pk: [], sk: []}, secondary derivations are empty, and default values are excluded.
- Sort indexes, entities, and derivations through createTableSnapshot, not registration order.
- snapshot() is pure and must not request IdbDB, call setup(), open a database, touch globalThis.indexedDB, or increment an IndexedDB version.

**Inputs from predecessors.** Task DynamoDB total table snapshots produces TableSnapshot and TableEntitySnapshotSource in src/snapshot/index.ts and createTableSnapshot plus tableSnapshotSource in src/snapshot/internal/table-snapshot.ts. Implement those exact internal interfaces; do not extend the normalized model.

**Out of scope.**

- Do not modify src/snapshot model, validation, diff, inspection, or rendering; task 2 owns them.
- Do not modify DynamoDB or SQLite sources.
- Do not duplicate native sparse-index integration tests already present in src/db/idb/**tests**/table.test.ts.
- Do not snapshot a database name, object-store name, connection, version counter, row count, or singleton default.

**Acceptance criteria.**

- [ ] src/db/idb/**tests**/snapshot.test.ts captures adapter idb, primary topology, every secondary index as sparse, complete keyed entity derivations, singleton shape, and all ESchema definitions.
- [ ] Dependency array order is preserved while entity registration order is canonicalized.
- [ ] Changing only a singleton default leaves the snapshot equal.
- [ ] snapshot(), Snapshot.inspect(), and Snapshot.diff() run without idbLayer, setup, fake-indexeddb, or a browser global and do not open a database.
- [ ] src/db/idb/README.md briefly documents table.snapshot() and links to the shared snapshot workflow.
- [ ] pnpm exec vitest run src/db/idb/**tests**/snapshot.test.ts succeeds.
- [ ] pnpm lint, pnpm test, and pnpm build succeed.

**Done when.** The IndexedDB producer returns task 2's unchanged normalized TableSnapshot without touching browser storage, and the full project is green.

---

## Task: Retire the source-tracking CLI and document snapshots [AFK]

**Why.** Keeping the old generated folders, hashes, and approval commands would leave two competing safety models and preserve the noise this design removes. Consumers should see one small library workflow and choose their own baseline store.

**What.** Delete the entire old eschema CLI implementation, tests, fixtures, source snapshots, manifest logic, and package binary. Remove its obsolete configuration and dependency footprint, then document the shared semantic snapshot workflow with Vitest and consumer-owned JSON approval.

**Read first.**

- docs/adr/0001-semantic-contract-snapshots.md — why the CLI is deliberately removed rather than wrapped.
- src/eschema/cli/main.ts, src/eschema/cli/index.ts, and src/eschema/cli/shared/schema-snapshots/index.ts — old entry point, commands, and source-tracking model being deleted.
- package.json and tsconfig.json — bin, dependencies, exports, and fixture exclusion.
- depcruise.config.ts and laymos.config.ts — obsolete CLI ignore/module entries.
- README.md and src/eschema/README.md — current CLI claims and new public workflow location.
- scripts/dynamodb/generate.ts — remaining @effect/platform-node use that prevents deleting the dependency entirely.

**Interface produced.**

- No eschema package binary remains. npx eschema is intentionally unsupported.
- README.md lists std-toolkit/snapshot as a public subpath and contains no Bin section.
- src/eschema/README.md demonstrates schema.snapshot(), Snapshot.decode, Snapshot.inspect, Snapshot.diff, Snapshot.render, and Snapshot.renderChanges, and states that consumers own storage and approval.
- The public runtime interfaces from tasks 1–4 are unchanged.

**Binding removal rules.**

- Delete the complete src/eschema/cli directory, including command tests, fixture helpers, generated version files, manifests, and snapshot fixtures.
- Remove package.json bin.eschema and the kleur dependency.
- Keep @effect/platform-node because scripts/dynamodb/generate.ts imports it, but move it from dependencies to devDependencies.
- Remove src/eschema/cli/**tests**/fixtures/** from tsconfig.json exclusions.
- Remove every src/eschema/cli ignore, boundary, or module entry from depcruise.config.ts and laymos.config.ts.
- Do not edit the parent workspace's pnpm-lock.yaml or catalog files from this std-toolkit-scoped task. The parent workspace still uses @effect/platform-node.
- Add a CHANGELOG.md breaking-change entry for removal of the binary and wildcard-importable std-toolkit/eschema/cli path.
- Vitest examples snapshot Snapshot.render output. Canonical baseline examples store JSON.stringify(schema.snapshot(), null, 2) output and load parsed JSON through Snapshot.decode; no library approval helper is introduced.

**Inputs from predecessors.** Task Semantic ESchema snapshots produces package export std-toolkit/snapshot and every Snapshot/ESchema.snapshot() call documented here. Tasks DynamoDB total table snapshots, SQLite table snapshot producer, and IndexedDB table snapshot producer own their adapter README table.snapshot() lines; this task must not rewrite those sections.

**Out of scope.**

- Do not add a replacement CLI, file scanner, folder generator, baseline store, approval command, CI gate, deployment gate, or UI.
- Do not alter snapshot types, classifications, rendering, or adapter implementation.
- Do not remove @effect/platform-node or edit scripts/dynamodb/generate.ts.
- Do not edit files above this std-toolkit worktree.

**Acceptance criteria.**

- [ ] src/eschema/cli no longer exists and package.json has no bin field or kleur dependency.
- [ ] @effect/platform-node is present only in devDependencies and pnpm build still compiles scripts/dynamodb/generate.ts.
- [ ] tsconfig.json, depcruise.config.ts, and laymos.config.ts contain no stale CLI paths.
- [ ] README.md and src/eschema/README.md contain no npx eschema, schema evolution CLI, generated folder, manifest, source snapshot, or approval-command instructions.
- [ ] The documented Vitest, JSON persistence, decode, inspect, diff, render, and renderChanges examples use the exact public API shipped by task 1.
- [ ] CHANGELOG.md calls out the intentional breaking removal.
- [ ] A repository search finds no src/eschema/cli, snapshots.json, or npx eschema reference outside the historical ADR and changelog.
- [ ] pnpm lint, pnpm lint:depcruise, pnpm test, and pnpm build succeed.

**Done when.** The old CLI and every active reference to its workflow are gone, the new semantic workflow is documented, and all four project commands succeed.
