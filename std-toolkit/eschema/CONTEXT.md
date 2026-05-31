# eschema

The ubiquitous language for `@std-toolkit/eschema` — a type-driven wrapper over
Effect Schema for versioned schemas that migrate old data forward on read.
This file is a glossary, not a spec: it fixes the words we use in code and
prose so they mean exactly one thing.

## Language

**evolving schema**:
A versioned schema definition that carries an ordered chain of versions from
`v1` to the latest, and folds older encoded data forward to the latest shape on
read. The central concept of the package; `ESchema` in code.
_Avoid_: schema (alone), eschema (in prose)

**value evolving schema**:
An evolving schema whose versions replace the decoded value as a whole rather
than evolving a field map by delta. It can stand alone or be nested inside
another evolving schema.
_Avoid_: literal schema, scalar schema, primitive schema

**variant**:
One of the object-shaped kinds of evolving schema — `ESchema`,
`SingleEntityESchema`, `EntityESchema` — which differ only in identity.
_Avoid_: flavor, level, kind, value evolving schema

**identity**:
The single axis that separates the three variants. `ESchema` is _anonymous_
(no identity); `SingleEntityESchema` is a _named singleton_ (identified by its
name, exactly one instance); `EntityESchema` is a _keyed entity_ (identified by
name plus a per-row id field). A value evolving schema has no identity.

**name**:
The human-readable identifier of a `SingleEntityESchema` or `EntityESchema`
(e.g. `'User'`). Anonymous `ESchema`s have no name.
_Avoid_: title, label, type name

**id field**:
The reserved key on an `EntityESchema` that holds each row's per-instance
identifier (e.g. `'id'`). `idField` in code. Auto-added and protected: it
cannot appear in the user's field map.
_Avoid_: key, primary key, identifier (for the field itself)

**version**:
The linear string stamp of one point in the chain — `'v1'`, `'v2'`, …. The
first is always `'v1'`; each `.evolve()` advances to the next. Written onto
encoded data as `_v`.
_Avoid_: revision, rev

**migration**:
The pure function `(prev) => next` that transforms a decoded value from the
previous version's shape into the next. Runs only on decode, only when reading
older data. For a value evolving schema, it receives and returns decoded values,
not value envelopes.
_Avoid_: transform, upgrade, converter

**evolution**:
One step of the chain — the record bundling a `version`, its field map, and the
`migration` that reaches it. The chain is a list of evolutions; the array is
named `evolutions` everywhere in code.
_Avoid_: step, revision, migration (for the whole record)

**chain**:
The full ordered list of evolutions from `v1` to the latest, held by the built
evolving schema. Decode walks it forward; encode targets its tail.
_Avoid_: history, versions list

**fields**:
The full field map — `Record<key, Schema>` — passed to `make` and held by each
evolution. `StructFieldsSchema` in code. Value evolving schemas do not have
fields.
_Avoid_: properties, attributes, columns

**delta**:
The partial change passed to `evolve` — `Record<key, Schema | null>` — where a
`Schema` entry adds-or-replaces a field and `null` removes it. `DeltaSchema` in
code.
_Avoid_: patch, diff, change set

**value schema**:
The complete Effect Schema for one version of a value evolving schema. Value
evolution replaces the value schema as a whole instead of applying a delta.
_Avoid_: value fields, scalar fields, literal fields

**shape**:
The structure of a decoded value at a given version. Decode "folds forward to
the latest shape".
_Avoid_: form, structure, layout

**decoded value**:
The in-memory value the application works with — latest shape, no metadata
fields. The output of `decode` and the input to `encode`.
_Avoid_: latest-shape value, model, domain object

**encoded value**:
The persisted or transmitted value that carries the decoded value and the `_v`
version stamp. The output of `encode` and the input to `decode`. "row" and
"wire value" are acceptable storage/transport-flavored synonyms inside examples
only.
_Avoid_: payload, raw row, stamped value (as the canonical term)

**bare value**:
A pre-adoption value for a value evolving schema with no envelope and no version
stamp. On the read path, a bare value is treated as earliest-version data,
including when the value evolving schema is nested. A value with the value
envelope shape is interpreted as an encoded value, not as a bare value.
_Avoid_: raw value, plain value, unwrapped value

**value envelope**:
The encoded value shape for a value evolving schema: an object with `_v` and
`value`, where `value` holds the encoded form of the decoded value. The `_v`
key is the discriminator for this internal shape.
_Avoid_: wrapper, box, container

**read path**:
The decode direction: `encoded value → decoded value`. The only place
migrations run.
_Avoid_: decode path, ingest

**write path**:
The encode direction: `decoded value → encoded value`, stamping the latest
`_v`.
_Avoid_: encode path, egress

**version stamp**:
The `_v` field carried by every encoded value, recording the version it was
written at. "Stamp" is also the verb: encode _stamps_ the latest `_v`. `_v` is
the only metadata field; there is no `_e`.
_Avoid_: version tag, version marker, \_v label

**reserved key**:
Any key starting with `_` — owned by the library, never allowed in a user's
fields (enforced by `ForbidUnderscorePrefix`). The `idField` of an
`EntityESchema` is separately reserved. Value envelopes use this rule to reserve
`_v` for library metadata at the envelope boundary; this does not reserve
underscore-prefixed keys inside the value itself.
_Avoid_: metadata key, system key, forbidden field

**builder**:
The chainable intermediate returned by `make` and `evolve` (`ESchemaBuilder`
etc.). It accumulates evolutions and cannot encode/decode until finalized.
_Avoid_: draft, factory, chain (for the builder itself)

**lifecycle**:
The fixed verb sequence `make → evolve → build → encode/decode`. `make` creates
a builder at `v1`; `evolve` appends an evolution; `build` finalizes the builder
into the built evolving schema; `encode`/`decode` are the write/read paths.
_Avoid_: pipeline, flow (as the canonical name)

**descriptor**:
The JSON Schema view of an evolving schema, produced by `getDescriptor()` and
typed `ESchemaDescriptor`. A deliberate abstraction — say "descriptor", not
"the JSON Schema", when referring to this output. It describes the canonical
encoded value, not legacy bare values accepted on the read path.
_Avoid_: json schema (for our output), spec, shape

**Standard Schema view**:
The Standard Schema v1 interface exposed by a built evolving schema. It follows
the read path: validation accepts the same inputs as `decode` and returns a
decoded value.
_Avoid_: validator view, standard validator

**Effect Schema view**:
The native Effect `Schema` produced by `toSchema()`, letting an evolving schema
drop into Effect pipelines — and letting one evolving schema be embedded as a
field of another (see _nested evolving schema_). The same function exposes
object-shaped and value evolving schemas.
_Avoid_: native schema, raw schema

**latest schema**:
The latest Effect Schema for the decoded value. For an object-shaped evolving
schema it is the struct built from latest fields; for a value evolving schema it
is the latest value schema.
_Avoid_: current schema, head schema

**nested evolving schema**:
An evolving schema used as the value of a field inside another evolving schema,
embedded via the _Effect Schema view_ (`toSchema`). A nested evolving schema
decodes through its _own_ chain, independently of the parent: its unstamped
values fold forward from its own `v1`, its bare values are accepted when it is a
value evolving schema, and its `_v` stamp is separate from the parent's. The verb
for the relationship is _compose_.
_Avoid_: child schema, sub-schema, inner schema (in prose)

**non-isolation**:
The property that an evolving schema's decode behavior is not local once it is
composed. Because a nested evolving schema folds forward through its own chain,
**evolving a nested schema changes what its parent decodes to even though the
parent's version is unchanged**. Versioning is per-schema; observable decode
behavior is tree-wide. The "no-op until you evolve past `v1`" guarantee is
therefore a whole-tree statement, not a per-schema one.
_Avoid_: coupling, leakage

**widening type**:
One of the `Any*` types that accepts a family of built evolving schemas:
`AnyESchema`, `AnySingleEntityESchema`, and `AnyEntityESchema` for
object-shaped variants; `AnyValueESchema` for value evolving schemas. Use a
separate all-family widening type, `AnyEvolvingSchema`, when code must accept
either object-shaped or value evolving schemas.
_Avoid_: base type, generic type, wildcard

## Type extractors

The decoded/encoded/identity types of an evolving schema, mirroring Effect's
`Schema.Type` / `Schema.Encoded` convention:

- `ESchemaType<T>` — the **decoded value** type. Works for object-shaped and
  value evolving schemas. (`ESchemaResult` is removed.)
- `ESchemaEncoded<T>` — the **encoded value** type. For a value evolving schema,
  this is the value envelope.
- `ESchemaIdField<T>` — the **id field** name of an `EntityESchema`.
- `ESchemaName<T>` — the **name** of a named variant.

## Read-path vocabulary

**fold forward**:
The core act of decode: take a value decoded at its stamped version and apply
every subsequent migration in order until it matches the latest shape.
_Avoid_: migrate forward, upgrade, replay

**latest**:
The newest version of an evolving schema, and the shape at that version.
`latestVersion` in code; encode always stamps it.
_Avoid_: current, head, newest
