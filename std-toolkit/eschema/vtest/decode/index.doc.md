---
title: decode
order: 3
---

# decode

`schema.decode(value)` reads the `_v` field off the input (falling back to
`latestVersion` if it is missing), decodes the row through the matching
evolution's struct, and then folds the result forward by applying every
subsequent migration in order. The output is always the latest decoded
shape.

Decode is the read path. It is the only place migrations run, and it is
where unknown versions, bad shapes, and broken chains surface as
`ESchemaError`.

## Usage

```ts
const decoded = yield * User.decode({ _v: 'v1', name: 'Bob' });
// migrated up to latest — { name: 'Bob', email: 'unknown@example.com', ... }
```

## API

| Argument    | Type                                     | Meaning                                                          |
| ----------- | ---------------------------------------- | ---------------------------------------------------------------- |
| `value`     | `unknown`                                | The raw row. `_v` is read if present; otherwise `latestVersion`. |
| **returns** | `Effect<Decoded<TLatest>, ESchemaError>` | Latest-shape decoded value.                                      |

## Flow

```
1.  read `_v` from `value` (if missing, default to latestVersion)
2.  locate the evolution at that version
       └─ not found?  → ESchemaError('Unknown schema version: …')
3.  decode `value` through `Schema.Struct(evolution.schema)`
       └─ ParseError? → ESchemaError('Decode failed', cause=ParseError)
4.  for each evolution after the matched one:
       data = evolution.migration(data)
5.  return data as Decoded<TLatest>
```

## Examples

### Migrate forward through the chain

```ts
const User = ESchema.make({ name: Schema.String })
  .evolve('v2', { email: Schema.String }, (p) => ({
    ...p,
    email: 'unknown@example.com',
  }))
  .evolve('v3', { verified: Schema.Boolean }, (p) => ({
    ...p,
    verified: false,
  }))
  .build();

const out = Effect.runSync(User.decode({ _v: 'v1', name: 'Bob' }));
// { name: 'Bob', email: 'unknown@example.com', verified: false }
```

### Missing `_v` is treated as latest

```ts
const out = Effect.runSync(User.decode({ name: 'Bob' }));
// decoded against the latest struct directly, no migrations run
```

### Unknown `_v`

```ts
const result = Effect.runSyncExit(User.decode({ _v: 'v99', name: 'Bob' }));
// Failure(ESchemaError('Unknown schema version: v99'))
```

### Bad shape

```ts
const result = Effect.runSyncExit(User.decode({ _v: 'v1', name: 42 }));
// Failure(ESchemaError('Decode failed', cause: ParseError))
```

### EntityESchema — id field required

```ts
const User = EntityESchema.make('User', 'id', { name: Schema.String }).build();
const out = Effect.runSync(User.decode({ _v: 'v1', id: 'u1', name: 'Alice' }));
out.id; // 'u1'
```

## Edge cases

- **Missing `_v` defaults to `latestVersion`.** A row with no version stamp
  is decoded against the latest struct directly; no migrations run. This
  is how new clients writing to a v1-only schema interact with the read
  path before any evolution exists.
- **Unknown `_v` fails with `Unknown schema version: <v>`.** Including
  the value in the message lets callers debug stale producers in
  production without inspecting the schema chain.
- **Decode failure wraps the `ParseError` as `cause`.** The `message` is
  the constant `'Decode failed'`; the `cause` field carries the original
  Effect Schema `ParseError` for inspection.
- **Migrations are applied strictly after `index + 1`.** A row at `v2`
  in a v1→v2→v3 chain runs only the `v2→v3` migration. A row at the
  latest version runs none.
- **The migration function is invoked synchronously.** Throwing inside a
  migration is not caught by `decode` — the exception escapes the
  Effect.
- **Decode is the only entry point that runs migrations.** The struct
  encoder, `getDescriptor`, and `~standard.validate` reuse `decode`
  semantics; they all fold forward to the latest shape.
- **`~standard.validate` runs `decode` synchronously via
  `Effect.runSyncExit`.** Any failure surfaces as `{ issues: [{ message }] }`.
  Migrations that perform async work would break this surface — keep them
  pure.
- **A v1 row encoded by the library carries `_v: 'v1'`; that stamp is
  what `decode` reads back.** Round-trips are stable: `encode → decode`
  ends at the same latest shape regardless of the value's history.

## Tests

The suites in `index.test.ts` lock down:

- v1 → latest migration chain folds every step.
- Missing `_v` falls back to `latestVersion` (no migrations).
- Unknown `_v` fails with `Unknown schema version: <v>`.
- Decode of a bad shape fails with `ESchemaError('Decode failed')`.
- Migration runs only for versions strictly older than the row.
- `~standard.validate` returns `{ value }` on success and `{ issues }` on failure.
- EntityESchema decode requires the id field.
