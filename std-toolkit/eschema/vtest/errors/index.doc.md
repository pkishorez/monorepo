---
title: errors
order: 5
---

# errors

Every fallible operation on an `ESchema` returns
`Effect.Effect<A, ESchemaError>`. `ESchemaError` is a single tagged error
type with a small, fixed set of `message` values; everything else (the
underlying Effect Schema `ParseError`, AST, etc.) is carried in `cause`.

This keeps the failure surface trivially matchable:
`Effect.catchTag('ESchemaError', …)` is enough to recover from every
schema-level failure.

## Usage

```ts
import { Effect } from 'effect';
import { ESchemaError } from '@std-toolkit/eschema';

const safe = User.decode(rawData).pipe(
  Effect.catchTag('ESchemaError', (err) => {
    console.error(err.message, err.cause);
    return Effect.succeed(defaultUser);
  }),
);
```

## Shape

```ts
class ESchemaError extends Data.TaggedError('ESchemaError')<{
  message: string;
  data?: unknown;
  cause?: unknown;
}> {}
```

| Field     | Meaning                                                                   |
| --------- | ------------------------------------------------------------------------- |
| `_tag`    | `'ESchemaError'` (set by `Data.TaggedError`)                              |
| `message` | A short, fixed string identifying the failure mode (see below).           |
| `data`    | Optional structured payload — currently unused by the library.            |
| `cause`   | The underlying error (e.g. an Effect Schema `ParseError`) for inspection. |

## Message catalog

| Message                         | Raised by                                | `cause`             |
| ------------------------------- | ---------------------------------------- | ------------------- |
| `'Encode failed'`               | `encode` — struct encoder rejected input | Effect `ParseError` |
| `'Decode failed'`               | `decode` — struct decoder rejected input | Effect `ParseError` |
| `'Unknown schema version: <v>'` | `decode` — `_v` not found in chain       | none                |
| `'Migration not found'`         | `decode` — internal invariant breach     | none                |
| `'No evolutions found'`         | `encode` — internal invariant breach     | none                |

The two "internal invariant" messages should never fire through the public
API; they exist defensively in case a malformed `Evolution[]` reaches the
runtime.

## Examples

### Pattern-match on the tag

```ts
const recovered = User.decode(value).pipe(
  Effect.catchTag('ESchemaError', () => Effect.succeed(null)),
);
```

### Inspect the underlying ParseError

```ts
const result = Effect.runSyncExit(User.decode({ _v: 'v1', name: 42 }));
// result.cause.error.message === 'Decode failed'
// result.cause.error.cause is the underlying ParseError
```

### Through Standard Schema

```ts
const r = User['~standard'].validate({ _v: 'v99' });
// { issues: [{ message: 'Unknown schema version: v99' }] }
```

## Edge cases

- **`ESchemaError` is the only error type from the public surface.** Every
  `encode` / `decode` failure is wrapped; no `ParseError` escapes
  unwrapped from the package.
- **`message` is a closed vocabulary.** Callers can branch on it as a
  literal string without worrying about new variants appearing silently.
- **`cause` is `unknown`.** Production code should not depend on its
  shape; treat it as informational. Where it is set, it is an Effect
  `ParseError`, but the type does not promise that.
- **`'Encode failed'` and `'Decode failed'` are the only messages that
  carry a `cause`.** Version-mismatch errors set `cause` to `undefined`
  because the failure is detected before the struct decoder runs.
- **The `Unknown schema version` message embeds the bad value.** The
  rendered string is `Unknown schema version: <_v>`, so logs include the
  offending stamp.
- **`Migration not found` indicates corruption.** If you see this, an
  `Evolution[]` array has been built by hand or mutated after `.build()`.
  Use the public builder API.
- **`Data.TaggedError` makes `_tag === 'ESchemaError'`.** This is how
  `Effect.catchTag('ESchemaError', …)` matches; do not rely on
  `instanceof` for cross-realm code.

## Tests

The suites in `index.test.ts` lock down:

- `ESchemaError._tag` is `'ESchemaError'`.
- `encode` failure has `message === 'Encode failed'` and a `cause`.
- `decode` failure (bad shape) has `message === 'Decode failed'` and a `cause`.
- `decode` of an unknown `_v` has `message` containing the offending version string.
- `Effect.catchTag('ESchemaError', …)` recovers from every failure mode.
