# eschema — Ubiquitous Language

Versioned, self-migrating schemas built on Effect Schema. An eschema knows its whole version history and folds older data forward to the latest shape on decode. It owns the **version** and **migration** vocabulary; the `_v` field on a core [[core]] **Entity Meta** is an eschema version. See the root `CONTEXT-MAP.md`.

## Language

**ESchema**:
A versioned schema for an object with named fields. Carries a mandatory name and knows every **version** of itself and how to migrate between them.
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

**ESchema snapshot**:
A structured, serializable description of every **version** on both its encoded and decoded sides, including any data constraints that cannot be described faithfully. It preserves the identity of nested ESchemas so local and **transitive changes** remain distinct, excludes migration behavior and presentation-only annotations, and may be rendered as stable human-readable text.
_Avoid_: Source snapshot, version-file snapshot.

**ESchema snapshot change**:
One difference between two **ESchema snapshots**, with its own safety classification and description. A snapshot comparison is a list of changes, not a single overall verdict.
_Avoid_: Overall status, snapshot result.

**snapshot identity**:
The stable name of an ESchema within an **ESchema snapshot**, taken from the ESchema's own mandatory name. One ESchema may be referenced any number of times under the same identity, while every distinct ESchema has a distinct identity.
_Avoid_: Generated ID, traversal ID.

**verifiable transformation**:
An Effect-provided schema transformation with a stable public identity that an **ESchema snapshot** can name. Other transformations are represented by their encoded and decoded sides and marked `unverifiable`.
_Avoid_: Inferred transformation, source-hashed transformation.

**migration**:
A total function transforming data from the prior **version** to the next during decode. Migrations are chained to fold any stored version up to the latest.
_Avoid_: transform, upgrade, converter.

**forward-read compatibility**:
The guarantee that the current application can decode every historical encoded version and fold it into the latest decoded shape. It does not require older application versions to read data written by newer versions.
_Avoid_: backward compatibility, rolling-deployment compatibility.

**encode**:
Serialization. Always writes the latest **version** and stamps `_v`.

**decode**:
Deserialization. Reads `_v`, then folds the data through **migration**s up to the current shape.

**toSchema**:
Converts an **ESchema** into a plain Effect Schema for validation or composition (e.g. nesting one eschema inside another).
_Avoid_: asSchema, toEffectSchema.

**ESchemaError** / **MigrationFailure**:
The decode/validation error type, and the report describing a failed **migration**.
