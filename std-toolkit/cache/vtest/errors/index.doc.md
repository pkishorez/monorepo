---
title: errors
order: 1
---

# errors

Every fallible operation on a `CacheStore`, `CacheEntity<T>` or
`CacheSingleItem<T>` returns `Effect.Effect<A, CacheError>`. `CacheError`
is a single tagged error class; the _kind_ of failure is carried inside
`error._tag`, and the original cause (an IndexedDB `DOMException`, a
thrown predicate, etc.) is preserved in `error.cause`.

This keeps the failure surface trivially matchable:
`Effect.catchTag('CacheError', …)` is enough to recover from every
cache-level failure, regardless of backend.

## Usage

```ts
import { Effect } from 'effect';
import { CacheError } from '@std-toolkit/cache';

const safe = users.get('u1').pipe(
  Effect.catchTag('CacheError', (err) => {
    console.error(err.error._tag, err.error.message, err.error.cause);
    return Effect.succeed(Option.none());
  }),
);
```

## Shape

```ts
class CacheError extends Data.TaggedError('CacheError')<{
  error: CacheErrorType;
}> {}

type CacheErrorType =
  | { _tag: 'OpenFailed'; message: string; cause?: unknown }
  | { _tag: 'GetFailed'; message: string; cause?: unknown }
  | { _tag: 'PutFailed'; message: string; cause?: unknown }
  | { _tag: 'DeleteFailed'; message: string; cause?: unknown }
  | { _tag: 'ClearFailed'; message: string; cause?: unknown };
```

| Field           | Meaning                                                        |
| --------------- | -------------------------------------------------------------- |
| `_tag`          | Always `'CacheError'` (set by `Data.TaggedError`).             |
| `error._tag`    | The failure kind — one of the five variants above.             |
| `error.message` | Short human-readable summary supplied by the call site.        |
| `error.cause`   | Underlying error (e.g. an IndexedDB `DOMException`), optional. |

## Variant catalog

| Variant        | Raised by                                                         |
| -------------- | ----------------------------------------------------------------- |
| `OpenFailed`   | `IDBCache#ensureReady`, `IDBCacheEntity.make` — DB couldn't open. |
| `GetFailed`    | `get`, `getAll`, `getLatest`, `getOldest` — read threw.           |
| `PutFailed`    | `put` — write threw (constraint violation, quota, etc.).          |
| `DeleteFailed` | `delete`, `deleteAll` — delete threw.                             |
| `ClearFailed`  | `IDBCache#destroy`, `destroyAllDatabases` — teardown threw.       |

Each variant has a matching static factory on `CacheError`:
`CacheError.openFailed`, `getFailed`, `putFailed`, `deleteFailed`,
`clearFailed`.

## Examples

### Pattern-match on the outer tag

```ts
const recovered = users
  .get('u1')
  .pipe(Effect.catchTag('CacheError', () => Effect.succeed(Option.none())));
```

### Branch on the inner variant

```ts
const result = users
  .put(item)
  .pipe(
    Effect.catchTag('CacheError', (err) =>
      err.error._tag === 'PutFailed'
        ? Effect.logWarning(`write rejected: ${err.error.message}`)
        : Effect.fail(err),
    ),
  );
```

### Construct via static factory

```ts
const err = CacheError.putFailed('quota exceeded', new DOMException('quota'));
err._tag; // 'CacheError'
err.error._tag; // 'PutFailed'
err.error.message; // 'quota exceeded'
err.error.cause; // DOMException
```

## Edge cases

- **`CacheError` is the only error type from the public surface.** Every
  `get` / `put` / `delete` failure is wrapped; no raw `DOMException` or
  thrown predicate escapes unwrapped from either backend.
- **`error._tag` is a closed vocabulary.** Callers can branch on it as a
  literal string union without worrying about new variants appearing
  silently.
- **`cause` is `unknown`.** Production code should not depend on its
  shape; treat it as informational. The IDB backend typically sets it to
  the underlying `DOMException`, but the type does not promise that.
- **Static factories preserve `cause`.** Calling
  `CacheError.openFailed(msg, e)` sets both `message` and `cause`; the
  second argument is optional.
- **`Data.TaggedError` makes `_tag === 'CacheError'`.** This is how
  `Effect.catchTag('CacheError', …)` matches; do not rely on
  `instanceof` for cross-realm code.

## Tests

The suites in `index.test.ts` lock down:

- `CacheError._tag` is `'CacheError'`.
- Each static factory (`openFailed`, `getFailed`, `putFailed`,
  `deleteFailed`, `clearFailed`) sets `error._tag` to the matching
  variant string.
- `cause` is preserved when supplied, and omitted (undefined) when not.
- `Effect.catchTag('CacheError', …)` recovers from a real backend
  failure (a `MemoryCacheEntity` `get` after an in-flight throw).
