---
title: evolve
order: 4
---

# evolve

`.evolve(version, delta, migration)` appends a new version to the chain. A
**delta** is a `Record<key, Schema | null>`: a Schema entry adds-or-replaces
that field on the previous version's struct, and a `null` entry **removes**
the field. The **migration** is a pure function that runs against decoded
values when reading an older row, transforming the previous version's shape
into the new one. The migration return type is constrained by `MergeSchemas`
so a missing field is a compile error.

Versions are linear strings: the first is `'v1'`, and each `.evolve()`
expects `NextVersion<TVersion>` — i.e. `'v2'` after `'v1'`, `'v3'` after
`'v2'`. The compiler enforces the sequence; the runtime trusts it.

## Usage

```ts
const User = ESchema.make({ name: Schema.String })
  .evolve('v2', { email: Schema.String }, (prev) => ({
    ...prev,
    email: 'unknown@example.com',
  }))
  .evolve('v3', { verified: Schema.Boolean }, (prev) => ({
    ...prev,
    verified: false,
  }))
  .build();
```

## API

| Argument    | Type                                                                   | Meaning                                                                |
| ----------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `version`   | `NextVersion<TVersion>` — literal `'v(N+1)'`                           | New latest version. The compiler enforces the sequence.                |
| `delta`     | `Record<key, Schema                                                    | null>`                                                                 | Adds (Schema) or removes (`null`) fields versus the previous version. |
| `migration` | `(prev: Decoded<previous>) => Decoded<merged>`                         | Pure transform from the previous decoded shape to the new one.         |
| **returns** | next builder with `TVersion = V`, `TLatest = MergeSchemas<TLatest, D>` | Mergeable into the chain; final shape only available after `.build()`. |

The merge semantics:

```
MergeSchemas<Base, Delta> = Omit<Base, keyof Delta>
                          & { [K in keyof Delta as Delta[K] extends null ? never : K]: Delta[K] }
```

That is: every key in the delta is dropped from base; non-null delta keys
are added back with the new schema. Equivalent at runtime to `mergeDelta`
in `src/schema.ts`.

## Examples

### Add a field

```ts
schema.evolve('v2', { age: Schema.Number }, (prev) => ({ ...prev, age: 0 }));
```

### Remove a field

```ts
schema.evolve('v2', { legacy: null }, (prev) => {
  const { legacy: _drop, ...rest } = prev;
  return rest;
});
```

### Transform — remove + add (rename)

```ts
schema.evolve(
  'v2',
  { firstName: null, lastName: null, fullName: Schema.String },
  (prev) => ({ id: prev.id, fullName: `${prev.firstName} ${prev.lastName}` }),
);
```

### Replace a field's schema (same key, different shape)

```ts
schema.evolve('v2', { count: Schema.NumberFromString }, (prev) => ({
  ...prev,
  count: prev.count, // type changes, value parses through the new schema on encode/decode
}));
```

### Entity — id field is re-injected each evolve

```ts
const User = EntityESchema.make('User', 'id', { name: Schema.String })
  .evolve('v2', { age: Schema.Number }, (prev) => ({ ...prev, age: 0 }))
  .build();

'id' in User.fields; // true — re-added by the builder's postMerge hook
```

## Edge cases

- **Version strings are sequenced at the type level.** `NextVersion<'v1'> =
'v2'`. Passing `'v2'` after `'v3'` is a TypeScript error. The runtime
  never validates this — it trusts the compiler.
- **A `null` delta entry removes the field.** `mergeDelta` deletes the key
  from the merged record. A subsequent `.evolve()` may re-introduce the
  same key with a different schema.
- **Migration sees the previous version's decoded type.** It receives the
  output of running the previous evolution's struct through `decode`, so
  any field transforms have already run.
- **Migration is invoked only when the read version is older than this
  step.** If a row is stored at this version or newer, the migration for
  this step is skipped.
- **Migrations are pure and synchronous.** They return a value, not an
  `Effect`. Throwing inside a migration propagates as an unhandled
  exception; `decode` does not wrap it in `ESchemaError`.
- **Underscore-prefixed delta keys are forbidden at the type level.** The
  same `ForbidUnderscorePrefix` guard applies on every `.evolve()`.
- **`EntityESchema.evolve` re-bans the id field in the delta.** The id
  column is injected for you on every evolution; supplying it in the
  delta is rejected at compile time.
- **`.fields` returns the last evolution's merged schema.** It is **not**
  the union of all evolutions. Only the latest shape is exposed.
- **The chain is monotone — there is no "branch" or "rollback".** `evolve`
  only appends. Once `.build()` is called, the chain is frozen.

## Tests

The suites in `index.test.ts` lock down:

- v1 → v2 → v3 chain assembles in order; `.latestVersion` matches.
- A `null` delta entry removes the field from `.fields`.
- A non-null delta entry adds the field to `.fields`.
- A rename (remove + add) survives a v1 decode.
- `EntityESchema.evolve` re-injects `idField` on every step.
- Migration receives the previous decoded shape (not the raw row).
