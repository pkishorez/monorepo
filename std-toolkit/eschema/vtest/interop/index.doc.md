---
title: interop
order: 6
---

# interop

Three interop surfaces let an `ESchema` participate in ecosystems that don't
speak the package's `decode`/`encode` directly:

| Surface             | Returns                                            | Use case                                  |
| ------------------- | -------------------------------------------------- | ----------------------------------------- |
| `toSchema(eschema)` | `Schema.Schema<Decoded, Encoded & { _v: string }>` | Embed inside another Effect Schema graph. |
| `.getDescriptor()`  | `JsonSchema7Object` (JSON Schema draft 7)          | Tools that expect JSON Schema.            |
| `.~standard`        | `StandardSchemaV1` with `validate(value)`          | Form libraries, validators, RPC adapters. |

The decode/migration chain runs **through every interop surface**. Embedding
an evolving schema inside a non-evolving one does not lose the version-aware
read path.

## Usage

```ts
import { toSchema } from '@std-toolkit/eschema';

const Inner = ESchema.make({ a: Schema.String })
  .evolve('v2', { b: Schema.String }, (p) => ({ ...p, b: '' }))
  .build();

const Embedded = Schema.Struct({ inner: toSchema(Inner) });

// Standard Schema validate
const result = Inner['~standard'].validate({ _v: 'v1', a: 'x' });
// { value: { a: 'x', b: '' } }
```

## API

### `toSchema(eschema)`

Wraps the schema in `Schema.declare` so it can be embedded in another
Effect Schema graph. Both `decode` and `encode` callbacks delegate to the
evolving schema's methods; failures are translated to
`ParseResult.Type` so they integrate cleanly with parent parse errors.

The wrapped schema's identifier is `ESchema(<name>)` for named variants and
`ESchema(anonymous)` for the base flavor.

### `eschema.getDescriptor()`

Returns a `JsonSchema7Object` rendered by Effect's
`JSONSchema.make(struct)`, with `_v: Schema.Literal(latestVersion)` added to
the struct first. The output includes `$schema` / `$defs` and is safe to
serialize to disk.

### `eschema['~standard']`

Implements [Standard Schema v1](https://github.com/standard-schema/standard-schema):

```ts
{
  version: 1,
  vendor: '@std-toolkit/eschema',
  types: { input, output },
  validate: (value) => { value } | { issues: [{ message }] },
}
```

`validate` runs the full decode + migration chain synchronously via
`Effect.runSyncExit`. On `Success` it returns `{ value }`; on `Fail` it
returns `{ issues: [{ message }] }` with the error's `message`; on any
other cause shape it returns `{ issues: [{ message: 'Unknown error' }] }`.

## Examples

### Embed an ESchema inside another Effect Schema

```ts
const Envelope = Schema.Struct({
  sentAt: Schema.String,
  payload: toSchema(User),
});

const decoded = Effect.runSync(
  Schema.decodeUnknown(Envelope)({
    sentAt: '2025-01-01',
    payload: { _v: 'v1', name: 'Bob' },
  }),
);
// payload is fully migrated to the latest User shape
```

### JSON Schema for documentation

```ts
const json = User.getDescriptor();
json.$schema; // 'http://json-schema.org/draft-07/schema#'
json.properties._v.enum; // ['v1'] (or [latestVersion])
json.required.includes('_v'); // true
```

### Standard Schema with a form library

```ts
// any library that consumes StandardSchemaV1 will accept this
form.use(User);
```

### Standard Schema — failure shape

```ts
const result = User['~standard'].validate({ _v: 'v99', name: 'B' });
// { issues: [{ message: 'Unknown schema version: v99' }] }
```

## Edge cases

- **`toSchema` preserves the migration chain.** A v1 row inside the
  wrapped schema is decoded and migrated to the latest shape just as
  `decode` would; the parent Schema sees the latest shape.
- **`toSchema` errors map to `ParseResult.Type`.** The `ESchemaError`'s
  `message` is passed as the `Type` constructor's message argument, so a
  parent decoder gets a clean parse error rather than a foreign error
  type.
- **`getDescriptor` injects `_v` as a literal.** The descriptor always
  declares `_v` as `Schema.Literal(latestVersion)`, so any JSON Schema
  consumer sees the version as a required constant.
- **`~standard.validate` runs decode synchronously.** It uses
  `Effect.runSyncExit`; an asynchronous side effect inside a migration
  would surface as `{ issues: [{ message: 'Unknown error' }] }`.
- **`~standard.validate` failure preserves the original `message`.** A
  `Fail` cause maps to a single-issue `{ issues }` whose message is the
  `ESchemaError`'s message — both `Decode failed` and
  `Unknown schema version: …` come through verbatim.
- **`~standard.vendor` is `'@std-toolkit/eschema'`, `version` is `1`.**
  This is a contract for adapters and should not change.
- **`toSchema` identifier uses the entity name when present.** For
  `EntityESchema` / `SingleEntityESchema` the wrapped schema's identifier
  is `ESchema(<name>)`; for plain `ESchema` it is `ESchema(anonymous)`.

## Tests

The suites in `index.test.ts` lock down:

- `toSchema` round-trips a v1 row through the parent decoder, fully migrated.
- `toSchema` maps `ESchemaError` to `ParseResult.Type` with the error message.
- `getDescriptor` includes `_v` as a literal at the latest version.
- `~standard.validate` returns `{ value }` on success.
- `~standard.validate` returns `{ issues: [{ message }] }` on a decode failure.
- `~standard.validate` returns the `Unknown schema version` message verbatim on bad `_v`.
- `~standard.vendor` is `@std-toolkit/eschema` and `version` is `1`.
