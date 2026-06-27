# eschema — Ubiquitous Language

Versioned, self-migrating schemas built on Effect Schema. An eschema knows its whole version history and folds older data forward to the latest shape on decode. It owns the **version** and **migration** vocabulary; the `_v` field on a core [[core]] **Entity Meta** is an eschema version. See the root `CONTEXT-MAP.md`.

## Language

**ESchema**:
A versioned schema for an object with named fields. Knows every **version** of itself and how to migrate between them.
_Avoid_: VersionedSchema, evolving schema.

**EntityESchema**:
An **ESchema** for a keyed entity — has a `name` (the entity type tag) and an `idField`.
_Avoid_: KeyedSchema.

**SingleEntityESchema**:
An **ESchema** for a singleton object — has a `name`, no id field.

**ValueESchema**:
A versioned schema for a single value (scalar, enum, union) rather than a named-field object.
_Avoid_: ScalarSchema, PrimitiveSchema.

**version**:
A tagged string identifier for one generation of a schema (e.g. `v1`, `v2`). The current value is stamped into core's `_v` on encode.
_Avoid_: revision, generation.

**INITIAL_VERSION**:
The constant `v1` — the starting **version** for every new schema. The v1 shape is frozen once data exists.

**Evolution**:
One step in a schema's history: a `{ version, schema, migration }` record pairing a **version** with its shape and the function that reaches it. `ValueEvolution` is the **ValueESchema** variant.
_Avoid_: Step, generation record.

**migration**:
A total function transforming data from the prior **version** to the next during decode. Migrations are chained to fold any stored version up to the latest.
_Avoid_: transform, upgrade, converter.

**encode**:
Serialization. Always writes the latest **version** and stamps `_v`.

**decode**:
Deserialization. Reads `_v`, then folds the data through **migration**s up to the current shape.

**toSchema**:
Converts an **ESchema** into a plain Effect Schema for validation or composition (e.g. nesting one eschema inside another).
_Avoid_: asSchema, toEffectSchema.

**ESchemaError** / **MigrationFailure**:
The decode/validation error type, and the report describing a failed **migration**.
