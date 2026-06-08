# ESchema

A way to **model persisted data that outlives its own shape.** Code changes
faster than the rows already sitting in a database or on a device. The moment
you add a field, rename one, or split a type, every old record is suddenly the
"wrong" shape. `@std-toolkit/eschema` makes that drift a first-class,
type-checked concern: a schema is not a single shape but a **chain of versions**,
and old data is migrated forward automatically on read.

This is the schema-modeling foundation the rest of the toolkit builds on — the
`cache` and `db` packages store the versioned envelopes that eschema defines.

## The mental model

An evolving schema is a chain of versions from `v1` to the latest. Four ideas
hold the whole package together:

1. **Encode writes the latest; decode folds forward.** `encode` always writes
   the newest version and stamps it with `_v`. Old versions are never written,
   only read. `decode` reads `_v`, finds that version in the chain, and applies
   each migration in order until the value matches the latest shape. You write
   the migrations once; eschema replays them on every read.

2. **No `_v` means v1.** Data with no version stamp decodes as `v1`, the
   earliest version. This is the trick that makes adopting eschema over an
   existing table non-breaking: wrap today's shape as `v1` and every legacy row
   already matches.

3. **Objects evolve by delta; whole values evolve by replacement.** An
   `ESchema` models an object and evolves by a **delta** — add, replace, or
   remove a field. A `ValueESchema` models a single value (an enum, a scalar, a
   union) and evolves by replacing the **whole** value schema, carrying its data
   on the wire in a `{ _v, value }` envelope.

4. **Schemas compose, but decoding is a whole-tree property.** `toSchema` turns
   an evolving schema into a native Effect Schema you can nest inside another.
   Each nested schema folds forward through its own chain independently — which
   is powerful, but means evolving a child changes what its parent decodes to.

Everything returns an `Effect` and fails with `ESchemaError`. Stay inside
`Effect.gen` / `yield*`; reserve `Effect.runSync` for tests and scripts.

## The doctrine (woven through the features)

These best practices keep an evolving schema honest. Each is taught in the
feature where it matters most.

- **`Schema.NullOr`, not `Schema.optional`.** Model "no value" as `null`, not an
  absent key. Migrations are total functions; an optional field forces every
  migration to branch on `undefined`. With `NullOr` the field is always present.
- **v1 is frozen.** Unstamped legacy data decodes as v1, so editing v1 after
  data exists silently breaks every old row. Only ever move forward with
  `.evolve`. Define v1 to mirror what was actually persisted.
- **Migrations are pure and one-step.** No IO, clock, or randomness — they run
  on any read. Write one small migration per version and let the chain compose;
  never handle "any old version" in a single migration.
- **Composition is non-isolating.** When you evolve a schema, audit every parent
  that embeds it — the no-op guarantee is a whole-tree statement.

## How the pieces fit

```
ESchema.make({...})         object, evolves by delta { field: S } / { field: null }
   .evolve('v2', delta, m)
   .build()                 ──▶  encode → { ...fields, _v: 'v2' }
                                 decode → folds v1→v2→… to latest

ValueESchema.make(S)        single value, evolves by whole-schema replacement
   .build()                 ──▶  encode → { _v: 'v2', value }

toSchema(child)             ──▶  a native Effect Schema; nest in a parent ESchema
                                 (each level carries its own _v, folds on its own)
```

## How to read this tutorial

Follow the features top-to-bottom. We start with **what an ESchema is** and the
small **`fromType` / `id`** helpers, then **evolving** an object's fields and the
**`NullOr` over `optional`** rule, then **adopting** eschema over existing data.
From there we cover **`ValueESchema`** for whole-value evolution, **composition**
via `toSchema`, and finally the **non-isolation** gotcha that composition
introduces. Each feature teaches one idea with a runnable example.
