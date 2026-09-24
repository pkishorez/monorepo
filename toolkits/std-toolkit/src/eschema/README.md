# std-toolkit/eschema

Versioned, self-migrating schemas built on Effect Schema; data written at any past version decodes to the current shape.

## Big picture

A schema is a chain of versions `v1 ... latest`. `encode` always writes the latest version and stamps `_v`. `decode` reads `_v` and folds the value forward through each migration. Data with no `_v` decodes as `v1`, so adopting eschema over existing rows is non-breaking. The full history of a shape lives in one declaration under version control, and the database never has to change. Vocabulary is in [CONTEXT.md](CONTEXT.md); the motivation and the rules the builder enforces are in [docs/evolving-schema.md](../../docs/evolving-schema.md). Contract snapshots of these schemas are produced by `std-toolkit/snapshot`, and the recommended per-table test is `std-toolkit/snapshot/vitest` (see the [top README](../../README.md#std-toolkitsnapshot)).

Pick the construct by what you are versioning: `ESchema` for an object with named fields, `EntityESchema` for a keyed entity with an id field, `ValueESchema` for a single scalar, enum, or union. A singleton object uses `ESchema` bound with `table.singleEntity()`.

## Install

See the [top README](../../README.md).

## Exports

### `std-toolkit/eschema`

| Export               | What it does                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `ESchema.make`       | Starts a builder for a named object schema; chain `evolve`, then `build`.                          |
| `EntityESchema.make` | Starts a builder for a keyed entity schema with a name and an id field.                            |
| `ValueESchema.make`  | Starts a builder for a versioned single value.                                                     |
| `toSchema`           | Converts an ESchema or ValueESchema into a plain Effect Schema for composing inside other schemas. |
| `fromType`           | Declares a field typed as `T` with no runtime check; use only for values eschema cannot describe.  |
| `id`                 | Marks a `Schema.String` field with an identifier annotation.                                       |
| `metaSchema`         | Effect Schema for the `_v` stamp alone.                                                            |
| `ESchemaError`       | Tagged error raised when decode or encode fails.                                                   |

Every built schema exposes `name`, `latestVersion`, `fields`, `schema`, `decode`, `encode`, `makePartial`, `getDescriptor`, and the Standard Schema `~standard` interface. `EntityESchema` adds `idField`.

## Usage

### Add a field to rows that already exist

Adding `priority` is one `evolve` step. The migration fills it in for every stored `v1` row on read. Lifted from story 17.

```ts
import { Effect, Schema } from 'effect';
import { EntityESchema } from 'std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

// A row written by the v1 code, exactly as storage holds it.
const januaryRow = {
  _v: 'v1',
  taskId: 't1',
  boardId: 'work',
  title: 'Plan',
  status: 'open',
};

const decoded = await Effect.runPromise(Task.decode(januaryRow));
// { taskId: 't1', boardId: 'work', title: 'Plan', status: 'open', priority: 'low' }

const encoded = await Effect.runPromise(Task.encode(decoded));
// { _v: 'v2', ..., priority: 'low' }
```

- Versions must be appended in sequence (`v2` after `v1`); the type system rejects gaps.
- Removing a field is `evolve('v3', { colour: null }, ...)`; renaming is a remove plus an add in the same step.
- Optional fields, `_`-prefixed keys, and fields that transform on the way in or out (such as `Schema.DateFromString`) are refused at build time so a snapshot can rebuild the shape from JSON.

### Try a new field before committing to a version

There is no trial mechanism: append the next `evolve` step and edit it freely until it is approved by a snapshot. Develop against the Memory adapter, on the server and in the browser alike, so a dropped step leaves no rows behind; a durable database keeps rows stamped with the trial version, and code that no longer has that version cannot read them. Lifted from story 19.

```ts
const TaskTryingDueDate = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { dueDate: Schema.NullOr(Schema.String) }, (v1) => ({
    ...v1,
    dueDate: null,
  }))
  .build();
```

- Dropping the idea is deleting the `evolve('v2', ...)` line.
- Keeping it is approving the snapshot; from then on v2 is frozen like any shipped version.
