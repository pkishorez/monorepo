# eschema — Ubiquitous Language

Versioned, self-migrating schemas built on Effect Schema. An eschema knows its whole version history and folds older data forward to the latest shape on decode. It owns the **version** and **migration** vocabulary; an encoded value carries its eschema version in `_v`. See the root `CONTEXT-MAP.md`.

## Language

**ESchema**:
A versioned schema for an object with named fields. Carries a mandatory name and knows every **version** of itself and how to migrate between them.
_Avoid_: VersionedSchema, evolving schema.

**EntityESchema**:
An **ESchema** for a keyed entity — has a `name` (the entity type tag) and an `idField`.
_Avoid_: KeyedSchema.

**single entity**:
A storage role for an **ESchema** that has exactly one record. Selected with `table.singleEntity(eschema)`; the schema itself needs no separate variant or id field.

**ValueESchema**:
A versioned schema for a single value (scalar, enum, union) rather than a named-field object.
_Avoid_: ScalarSchema, PrimitiveSchema.

**version**:
A tagged string identifier for one generation of a schema (e.g. `v1`, `v2`). Encoding stamps it into the encoded value's `_v` field.
_Avoid_: revision, generation.

**approved version**:
A **version** present in an accepted **ESchema snapshot**. Its encoded and decoded data contracts are frozen; later changes must be expressed as a new version.
_Avoid_: Editable latest version.

**INITIAL_VERSION**:
The constant `v1` — the starting **version** for every new schema. The v1 shape is frozen once data exists.

**Evolution**:
One step in a schema's history: a `{ version, schema, migration }` record pairing a **version** with its shape and the function that reaches it. `ValueEvolution` is the **ValueESchema** variant.
_Avoid_: Step, generation record.

**transitive change**:
A change visible through an **ESchema** because an ESchema nested inside it evolved. It is not an **Evolution** of the containing ESchema and does not require a new containing **version**.
_Avoid_: Parent evolution, implicit evolution.

**migration**:
A total function transforming data from the prior **version** to the next during decode. Migrations are chained to fold any stored version up to the latest.
_Avoid_: transform, upgrade, converter.

**forward-read compatibility**:
The guarantee that the current application can decode every historical encoded version and fold it into the latest decoded shape. It does not require older application versions to read data written by newer versions.
_Avoid_: backward compatibility, rolling-deployment compatibility.

**encode**:
Serialization. Always writes the latest **version** and stamps `_v`. Encoded values are intended for JSON persistence and transport, but schema authors are currently responsible for choosing JSON-serializable encoded field types.

**decode**:
Deserialization. Reads `_v`, then folds the data through **migration**s up to the current shape.

**toSchema**:
Converts an **ESchema** into a plain Effect Schema for validation or composition (e.g. nesting one eschema inside another).
_Avoid_: asSchema, toEffectSchema.

**ESchemaError** / **MigrationFailure**:
The decode/validation error type, and the report describing a failed **migration**.
