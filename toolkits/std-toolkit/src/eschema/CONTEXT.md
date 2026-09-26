# eschema — Ubiquitous Language

Versioned, self-migrating schemas built on Effect Schema. An eschema knows its whole version history and folds any **encoded form** forward to its latest **value** when it is decoded. It owns the **version** and **migration** vocabulary and the two forms of data: the **value** application code works with, and the internal **encoded form**. A value's **version** always sits right beside it: in [[core]] **Entity Meta** for an Entity's value, and inline as `_v` for an ESchema value nested inside another. See the root `CONTEXT-MAP.md`.

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
A versioned schema for a single value (scalar, enum, list, map, union) rather than a named-field object. When nested inside another ESchema value it is encoded in a **value envelope**.
_Avoid_: ScalarSchema, PrimitiveSchema.

**value envelope**:
The form of a **ValueESchema** value nested inside another ESchema value: exactly `{ _v, _value }`, so the nested value carries its own version. The `_value` key marks it, so it can never be confused with ESchema data; an envelope with any other key is refused. A value with no `_value` key is read as v1.
_Avoid_: wrapper, value wrapper.

**version**:
A tagged string identifier for one generation of a schema (e.g. `v1`, `v2`). It travels beside the value it describes: in **Entity Meta** `_v` for an Entity, inline `_v` for a nested ESchema value.
_Avoid_: revision, generation.

**approved version**:
A **version** present in an accepted **table snapshot**. Its encoded shape is frozen; later changes must be expressed as a new version. A version that is not yet approved is freely editable, and dropping it leaves nothing behind so long as no durable store has written rows stamped with it.
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
A total function transforming a **value** of the prior **version** into a value of the next, run while decoding. It works on rich values (a `Date`, not its stored string); each version's own fields convert its **encoded form** before the first migration runs. Migrations are chained to fold any written version up to the latest.
_Avoid_: transform, upgrade, converter.

**forward-read compatibility**:
The guarantee that the current application can decode every historical **encoded form** into its latest **value**. It does not require older application versions to read data written by newer versions.
_Avoid_: backward compatibility, rolling-deployment compatibility.

**value**:
Data in the rich form application code wants (`typeof X.Type`) — a field stored as an ISO string can be a `Date` here. Only **migrations** see values of older versions; everywhere else a value is in the latest **version**, and it is the only form application code handles: every database operation, broadcast, RPC handler and client, Collection row, and Mutation Callback carries it. An in-memory value is always in the latest version.
_Avoid_: migrated form, decoded form, domain value, latest form.

**encoded form**:
Data as it is stored or sent — database, transport, Sync Store, Peer Sync — in whichever **version** it was written (`typeof X.Encoded`). The top-level version travels beside it in [[core]] **Entity Meta**; a nested ESchema value carries its own inline `_v`. It is the only form that is versioned, migrated, and captured by a **table snapshot**, so every field's encoded side must be describable in **snapshot types**: a struct, string, number, boolean, null, literal, union, array, string-keyed record, enum, nested ESchema, recursive schema, or opaque value declared with `fromType`. Anything else, such as a declared `Date`, `undefined`, `bigint`, or a symbol, is refused when the schema is defined, and so is a constructor default. Checks are allowed but must be describable as a **check**; checks inside a conversion belong to the conversion and are ignored. It is internal: the toolkit converts at every boundary, and application code never builds, reads, or types one. A field's encoded side and its **value** side may differ (an ISO string and a `Date`); how a field converts between them is not versioned, so a field must never change meaning without changing its name or encoded shape.
_Avoid_: serialized form, stored form, raw value.

**decode** / **encode**:
Decoding reads an **encoded form** in any known **version**, converts it with that version's own fields, and runs **migrations** on the resulting values up to the latest version; a version newer than the schema knows fails with `OutdatedVersion`. Encoding converts a **value** to the latest encoded form and never migrates. These are the Effect Schema directions of **toSchema** and core's `EntitySchema`; nothing else in std-toolkit is called decoding.
_Avoid_: serialize, deserialize, read migration (outside [[db]]).

**toSchema**:
Converts an **ESchema** into a plain Effect Schema for validation or composition (e.g. nesting one eschema inside another).
_Avoid_: asSchema, toEffectSchema.

**entity reference**:
A visualization hint that a field identifies an Entity through that Entity's `idField`; the target is declared by stable Entity name rather than inferred from the field's name. It changes no validation, storage, lookup, or integrity behavior; cardinality follows the surrounding schema shape, cyclic references need no special treatment, and the target may be unresolved or belong to another table.
_Avoid_: Foreign key, ID-shaped field, inferred relationship.

**ESchemaError** / **MigrationFailure**:
The decode/validation error type, and the report describing a failed **migration**.
