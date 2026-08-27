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
Serialization. Always writes the latest **version** and stamps `_v` — even when a **draft version** exists, encode never targets the draft's own shape, since a draft has no version of its own. Encoded values are intended for JSON persistence and transport; a field is enforced, at definition time, to use only a shape a Snapshot can capture and later restore — an object, primitive, literal, union, array, enum, template literal, or branded value. A custom transformation, or a filter or declared type without a stable identity, is refused before the schema can be built. `Schema.UniqueSymbol` is a known exception: a registered symbol from `Symbol.for(...)` can be captured, but a local symbol from `Symbol(...)` is accepted when the ESchema is defined and fails during snapshot capture because it has no stable identity.

**draft version**:
An unpublished, dev-time-only overlay on an **ESchema**, added with `.draft(delta, { forward, backward })`. At most one exists at a time. **decode** runs the normal **migration** chain up to the last **version**, then the draft's `forward` migration; **encode** runs the draft's `backward` migration first, then writes and stamps `_v` against that same last version — persisted bytes never move while a draft is in place. A draft is not a **version**: it never appears in an **Evolution**, so it is invisible to **ESchema snapshot** capture and both the file-based and table-level baselines.
_Avoid_: staged version, preview version.

**promote**:
Turning a **draft version** into a real **version** — a plain source edit, not a runtime call. The developer replaces `.draft(delta, { forward, backward })` with `.evolve(nextVersion, delta, forward)`, dropping `backward` since encode now targets the new latest directly.
_Avoid_: publish, confirm (as a runtime action).

**decode**:
Deserialization. Reads `_v`, then folds the data through **migration**s up to the current shape.

**toSchema**:
Converts an **ESchema** into a plain Effect Schema for validation or composition (e.g. nesting one eschema inside another).
_Avoid_: asSchema, toEffectSchema.

**ESchemaError** / **MigrationFailure**:
The decode/validation error type, and the report describing a failed **migration**.
