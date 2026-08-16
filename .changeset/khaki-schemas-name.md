---
'std-toolkit': patch
---

Give every schema a name and move snapshots to their own entrypoint.

**Breaking:** `ESchema.make` and `ValueESchema.make` now require a name as the
first argument. `ESchema.make({ ... })` becomes `ESchema.make('Name', { ... })`,
and `ValueESchema.make(schema)` becomes `ValueESchema.make('Name', schema)`. The
name is the schema's snapshot identity, must be non-empty (enforced at the type
level and at runtime), and must be unique across composed schemas.

**Breaking:** `toSchema` no longer accepts a `ToSchemaOptions` second argument;
the identifier is always derived from the schema's own name. Replace
`toSchema(schema, { name: 'X' })` with `toSchema(schema)` and set the name in
`make`.

**Breaking:** the `eschema` binary and the wildcard-importable
`std-toolkit/eschema/cli` path are removed. Semantic snapshots now live at
`std-toolkit/snapshot`, with `std-toolkit snapshot` providing single-file
baseline verification and approval. `Snapshot`, `SnapshotDecodeError`,
`SnapshotIdentityConflict`, and every snapshot type (`ContractSnapshot`,
`ESchemaSnapshot`, `TableSnapshot`, `SnapshotChange`, …) move there from
`std-toolkit/eschema`.

**Breaking:** `SingleEntityESchema` and `AnySingleEntityESchema` are removed.
Define singleton values with `ESchema.make(...)`, then select singleton behavior
with `table.singleEntity(schema)` or `singleItemSync`. Generic singleton helpers
can use the newly exported `AnyUnkeyedESchema` to reject keyed entities.
Standalone snapshots of these schemas now use the `struct` kind; table snapshots
continue to classify their binding as `singleton`.

**Breaking:** optional fields are rejected at the type level. `Schema.optional`,
`Schema.optionalKey`, and any field whose type admits `undefined` (for example
`Schema.UndefinedOr`) no longer compile in `make` or `evolve`. Model absence as
`null` via `Schema.NullOr(...)`.

**Breaking:** DynamoDB secondary indexes are classified by how they are
declared. `.gsi(...)` always produces a GlobalSecondaryIndex, even when its
partition key matches the table's primary partition key — previously such an
index was silently emitted as a LocalSecondaryIndex. Use `.lsi(...)` where a
local index is intended; re-provisioned environments and table snapshots reflect
the declared kind.

**Breaking:** the `effect` peer range moves to `^4.0.0-beta.102` (was
`^4.0.0-beta.78`) to pick up the beta.102 schema changes. `@effect/platform-node`
and `kleur` are no longer runtime dependencies.
