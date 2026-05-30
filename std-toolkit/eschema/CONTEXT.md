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

**variant**:
One of the three kinds of evolving schema — `ESchema`, `SingleEntityESchema`,
`EntityESchema` — which differ only in identity.
_Avoid_: flavor, level, kind

**identity**:
The single axis that separates the three variants. `ESchema` is _anonymous_
(no identity); `SingleEntityESchema` is a _named singleton_ (identified by its
name, exactly one instance); `EntityESchema` is a _keyed entity_ (identified by
name plus a per-row id field).

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
older data.
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
evolution. `StructFieldsSchema` in code.
_Avoid_: properties, attributes, columns

**delta**:
The partial change passed to `evolve` — `Record<key, Schema | null>` — where a
`Schema` entry adds-or-replaces a field and `null` removes it. `DeltaSchema` in
code.
_Avoid_: patch, diff, change set

**shape**:
The structure of a decoded value at a given version. Decode "folds forward to
the latest shape".
_Avoid_: form, structure, layout

**decoded value**:
The in-memory value the application works with — latest shape, no metadata
fields. The output of `decode` and the input to `encode`.
_Avoid_: latest-shape value, model, domain object

**encoded value**:
The persisted or transmitted value — the decoded value plus the `_v` version
stamp. The output of `encode` and the input to `decode`. "row" and "wire value"
are acceptable storage/transport-flavored synonyms inside examples only.
_Avoid_: payload, raw row, stamped value (as the canonical term)

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
`EntityESchema` is separately reserved.
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
"the JSON Schema", when referring to this output.
_Avoid_: json schema (for our output), spec, shape

**Effect Schema view**:
The native Effect `Schema` produced by `toSchema()`, letting an evolving schema
drop into Effect pipelines.
_Avoid_: native schema, raw schema

**widening type**:
One of `AnyESchema` / `AnySingleEntityESchema` / `AnyEntityESchema` — the
`Any*` types that accept any variant at that identity level or wider.
_Avoid_: base type, generic type, wildcard

## Type extractors

The decoded/encoded/identity types of an evolving schema, mirroring Effect's
`Schema.Type` / `Schema.Encoded` convention:

- `ESchemaType<T>` — the **decoded value** type. (`ESchemaResult` is removed.)
- `ESchemaEncoded<T>` — the **encoded value** type (decoded plus `_v`).
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
