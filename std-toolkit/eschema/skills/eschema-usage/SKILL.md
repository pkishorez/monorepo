---
name: eschema-usage
description: How to model versioned data with @std-toolkit/eschema — evolving schemas, value evolving schemas, composition via toSchema, and the package's best practices (NullOr over optional, total migrations, frozen v1, non-isolation). Use when writing or reviewing code that defines, evolves, nests, encodes, or decodes an ESchema / ValueESchema, or when choosing how to version a persisted shape.
---

# eschema-usage

Guidance for using `@std-toolkit/eschema`: versioned schemas that migrate old
data forward on read, built on Effect Schema. A runnable tutorial lives at
`std-toolkit/eschema/src/tutorial/` — point users there for a guided tour; this
skill is the working reference and rule set.

## Core model

A schema is a chain of versions `v1 … latest`.

- **encode** always writes the **latest** version and stamps `_v`. Old versions
  are never written, only read.
- **decode** reads `_v`, finds that version, and **folds forward** — applies
  each migration in order to reach the latest shape.
- Data with **no `_v` decodes as `v1`** (the earliest version). This is what
  makes adopting eschema over existing data non-breaking.

Everything returns an `Effect`. Stay inside `Effect.gen`/`yield*`; reserve
`Effect.runSync` for tests and scripts.

## Choosing the right construct

| You're versioning…                     | Use                   |
| -------------------------------------- | --------------------- |
| An object with named fields            | `ESchema`             |
| A single value (enum / scalar / union) | `ValueESchema`        |
| A named singleton object               | `SingleEntityESchema` |
| A keyed entity (name + per-row id)     | `EntityESchema`       |

`ESchema` evolves by **delta** (add/remove/replace fields). `ValueESchema`
replaces the **whole value schema** each version, and its migration receives and
returns the decoded value itself (wrapped on the wire in a `{ _v, value }`
_value envelope_).

## API shape

```ts
const User = ESchema.make({ name: Schema.String })
  .evolve('v2', { email: Schema.NullOr(Schema.String) }, (prev) => ({
    ...prev,
    email: null,
  }))
  .build();

// evolve delta semantics:
//   { field: Schema.X }  -> add or replace `field`
//   { field: null }      -> remove `field`
// The migration is (prev) => next, pure, handling ONLY the previous version.
```

Versions advance one step at a time (`v1 → v2 → v3`); you cannot skip. The
migration's `prev` is typed as the previous version, so TypeScript catches a
migration that drops or mistypes a field.

## Composition

Embed one evolving schema inside another with `toSchema`, which yields a native
Effect Schema usable anywhere — including inside `Schema.Array`:

```ts
const Ticket = ESchema.make({
  title: Schema.String,
  status: toSchema(Status), // a ValueESchema
  addresses: Schema.Array(toSchema(Address)), // an array of ESchema
}).build();
```

Each nested schema folds forward through **its own** chain, independently of the
parent, and carries its own `_v`. Array elements may sit at different versions
and each migrates on its own.

## Best practices (enforce these in review)

1. **`Schema.NullOr`, not `Schema.optional`.** Model "no value" as `null`, not an
   absent key. Migrations are total functions; an optional field forces every
   migration to branch on `undefined` and makes the encoded shape unstable.
   With `NullOr` the field is always present with a definite value. When adding
   a field, make it `NullOr` and default it to `null` in the migration.
2. **v1 is frozen.** Unstamped legacy data decodes as v1, so editing v1's fields
   after data exists silently breaks every old row. Only ever move forward with
   `.evolve`.
3. **Migrations are pure and one-step.** No IO, clock, or randomness — they run
   on any read. Write one small migration per version; let the chain compose.
   Never try to handle "any old version" in a single migration.
4. **`v1` must mirror real historical data.** If unstamped data doesn't match
   v1, decode fails loudly rather than guessing — that's intended. Define v1 to
   match what was actually persisted.
5. **No `_`-prefixed field names.** They're reserved for library metadata and
   rejected at the type level.
6. **Schemas are immutable after `.build()`.** Declare every version first.
7. **Don't read `.fields` / `.schema` at module-load time.** It can throw an
   init error if accessed before module initialisation completes. Build schemas
   at module scope; compute derived values lazily inside functions.

## Non-isolation (the composition gotcha)

A nested schema's decode behaviour is **not local**. Because a child folds
forward through its own chain, **evolving a child changes what its parent
decodes to even though the parent's `_v` is unchanged.** A parent stamped `v1`
whose child evolved `v1 → v2` now yields child values folded to v2.

Therefore the "no-op until you evolve past v1" guarantee is a **whole-tree**
statement, not a per-schema one. **When you evolve a schema, audit every parent
that embeds it**, not just the schema you changed.

## Common tasks

- **Rename a field:** one `.evolve` that removes the old key (`null`) and adds
  the new one; the migration copies the value across.
- **Change a field's stored type:** use a `Schema.transform` as the field
  schema (decode/encode convert between wire and in-memory types).
- **Adopt eschema on a live table:** wrap the current shape as `v1` and ship
  (a pure no-op while single-version); add `.evolve` steps later — legacy rows
  fold forward from v1 automatically.
- **Type extraction:** `ESchemaType<typeof S>` (decoded), `ESchemaEncoded<typeof S>`
  (encoded — the value envelope for a `ValueESchema`).
