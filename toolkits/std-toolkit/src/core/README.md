# @kstackz/std-toolkit/core

Entity envelope, metadata schemas, ULID generation, and the change Broadcaster shared by every std-toolkit subpath.

## Big picture

`core` is the shared kernel. It defines the one Entity shape, `{ value, meta }`, used in application code and on the wire alike, with the value's version in `meta._v` (an ESchema's `entity` and `singleEntity` convert it), and the metadata fields `_e`, `_u`, `_d`, `_s`, `_c` that the db and sync subpaths interpret. It also owns the `Ulid` generator that produces `_u` and the `Broadcaster` hook that fans out confirmed writes. Vocabulary is in [CONTEXT.md](CONTEXT.md).

## Install

See the [top README](../../README.md).

## Exports

### `@kstackz/std-toolkit/core`

| Export                   | What it does                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `EntityMetaSchema`       | Effect Schema for keyed Entity metadata: `_e`, `_u`, `_d`, and optional `_s`, `_c`.          |
| `SingleEntityMetaSchema` | Effect Schema for singleton Entity metadata, without the deletion and observation fields.    |
| `Broadcaster`            | Effect Service that receives batches of confirmed Entities and exposes them as a Stream.     |
| `defaultBroadcaster`     | In-process PubSub-backed Layer for `Broadcaster`.                                            |
| `sharedBroadcaster`      | Layer for `Broadcaster` shared by every tab of this origin under one name.                   |
| `Ulid`                   | Effect Reference holding the monotonic ULID generator; override it in tests for stable ids.  |
| `nextUlid`               | Effect that yields the next ULID from `Ulid`.                                                |
| `uTime`                  | Extracts the millisecond time from a `_u` value, whether ULID or ISO-8601; `null` otherwise. |
| `StdToolkitError`        | Base tagged error with `message` and optional `code`.                                        |

## Usage

### Deterministic ids in tests

Adapters stamp `_u` with `nextUlid`. Providing a different generator through `Ulid` makes every write predictable.

```ts
import { Effect } from 'effect';
import { Ulid } from '@kstackz/std-toolkit/core';

const sequentialUlid = () => {
  let issued = 0;
  return () => String(++issued).padStart(26, '0');
};

const program = task.insert(draft);

await Effect.runPromise(
  program.pipe(
    Effect.provide(memory.layer),
    Effect.provideService(Ulid, sequentialUlid()),
  ),
);
```

- `Ulid` is a `Context.Reference` with a default, so nothing needs to provide it in production.
- The StdTable kernel calls `nextUlid` on every write; adapters store the value they are given and never generate their own.
- `uTime` reads either format back, which matters for backends that stamp `_u` with timestamps.
