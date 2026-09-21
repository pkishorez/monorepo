# std-toolkit/eschema

Versioned, self-migrating schemas built on Effect Schema; data written at any past version decodes to the current shape.

## Big picture

A schema is a chain of versions `v1 ... latest`. `encode` always writes the latest version and stamps `_v`. `decode` reads `_v` and folds the value forward through each migration. Data with no `_v` decodes as `v1`, so adopting eschema over existing rows is non-breaking. The full history of a shape lives in one declaration under version control, and the database never has to change. Vocabulary is in [CONTEXT.md](CONTEXT.md); the motivation and the rules the builder enforces are in [docs/evolving-schema.md](../../docs/evolving-schema.md). Contract snapshots of these schemas are produced by `std-toolkit/snapshot` (see the [top README](../../README.md#std-toolkitsnapshot) and [docs/snapshot-cli.md](../../docs/snapshot-cli.md)).

Pick the construct by what you are versioning: `ESchema` for an object with named fields, `EntityESchema` for a keyed entity with an id field, `ValueESchema` for a single scalar, enum, or union. A singleton object uses `ESchema` bound with `table.singleEntity()`.

## Install

See the [top README](../../README.md).

## Exports

### `std-toolkit/eschema`

| Export                 | What it does                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `ESchema.make`         | Starts a builder for a named object schema; chain `evolve`, optionally `draft`, then `build`.      |
| `EntityESchema.make`   | Starts a builder for a keyed entity schema with a name and an id field.                            |
| `ValueESchema.make`    | Starts a builder for a versioned single value.                                                     |
| `DraftedESchema`       | Class of an object schema whose latest step is a draft; produced by `.draft(...).build()`.         |
| `DraftedEntityESchema` | Class of a keyed entity schema whose latest step is a draft.                                       |
| `toSchema`             | Converts an ESchema or ValueESchema into a plain Effect Schema for composing inside other schemas. |
| `fromType`             | Declares a field typed as `T` with no runtime check; use only for values eschema cannot describe.  |
| `id`                   | Marks a `Schema.String` field with an identifier annotation.                                       |
| `metaSchema`           | Effect Schema for the `_v` stamp alone.                                                            |
| `ESchemaError`         | Tagged error raised when decode or encode fails.                                                   |

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

`draft` layers a field on top of the latest version without creating a new version. `forward` fills it on read, `backward` strips it on write. Lifted from story 19.

```ts
const TaskTryingDueDate = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .draft(
    { dueDate: Schema.NullOr(Schema.String) },
    {
      forward: (v1) => ({ ...v1, dueDate: null }),
      backward: ({ dueDate: _dueDate, ...v1 }) => v1,
    },
  )
  .build();
```

- The result is a `DraftedEntityESchema`; storage never sees `dueDate`.
- Committing the draft is a source edit: turn `draft` into `evolve('v2', ...)`, keep `forward`, drop `backward`.
