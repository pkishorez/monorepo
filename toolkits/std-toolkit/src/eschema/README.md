# std-toolkit/eschema

Versioned, self-migrating schemas built on Effect Schema; data written at any past version decodes to the current shape.

## Big picture

A schema is a chain of versions `v1 ... latest`. A written value is always the latest version, stamped with `_v`; decoding takes `_v`, reads the data with that version's fields, and folds it forward through each migration into the latest value. A field may hold a rich value in code (a `Date`) and a plain one in storage (its ISO string). Data with no `_v` reads as `v1`, so adopting eschema over existing rows is non-breaking. A version newer than the schema knows fails with `OutdatedVersion`. Application code only sees the latest value, typed `typeof X.Type`; the encoded form, which carries the version, stays inside the toolkit. The full history of a shape lives in one declaration under version control, and the database never has to change. Vocabulary is in [CONTEXT.md](CONTEXT.md); the motivation and the rules the builder enforces are in [docs/evolving-schema.md](../../docs/evolving-schema.md). Contract snapshots of these schemas are produced by `std-toolkit/snapshot`, and the recommended per-table test is `std-toolkit/snapshot/vitest` (see the [top README](../../README.md#std-toolkitsnapshot)).

Pick the construct by what you are versioning. `EntityESchema` is for a table row keyed by an id field. `ESchema` is for any other object with named fields that follows the field rules, including a singleton bound with `table.singleEntity()`. `ValueESchema` is for everything else: a scalar, an enum, a list, a map, a union of different objects, or an existing object with optional fields. In every kind, a top-level field starting with `_` is reserved for the toolkit and refused. The full guide is in [docs/evolving-schema.md](../../docs/evolving-schema.md#which-one-do-i-pick).

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
| `ESchema.fromType`   | Declares a field typed as `T` with no runtime check; use only for values eschema cannot describe.  |
| `ESchema.id`         | Marks a `Schema.String` field with an identifier annotation.                                       |
| `ESchemaError`       | Tagged error raised when a value cannot be read or written.                                        |
| `OutdatedVersion`    | Tagged error raised when a value carries a version newer than the schema knows.                    |
| `checkAnnotation`    | Names a check the built-in catalogue does not know, so a snapshot can list it.                     |
| `SnapshotTypeSchema` | Effect Schema for the snapshot type language that describes a field's stored shape.                |

Every built `ESchema` and `EntityESchema` exposes `name`, `latestVersion`, `fields`, `schema`, `getDescriptor`, the `Type` and `Encoded` type carriers, and the Standard Schema `~standard` interface, which validates a latest value. `EntityESchema` adds `idField`.

## Usage

### Add a field to rows that already exist

Adding `priority` is one `evolve` step. The migration fills it in for every stored `v1` row on read. Lifted from story 17.

```ts
import { Effect, Schema } from 'effect';
import { EntityESchema, toSchema } from 'std-toolkit/eschema';

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

const stored = toSchema(Task);

const task = await Effect.runPromise(
  Schema.decodeUnknownEffect(stored)(januaryRow),
);
// { taskId: 't1', boardId: 'work', title: 'Plan', status: 'open', priority: 'low' }

const written = await Effect.runPromise(Schema.encodeEffect(stored)(task));
// { _v: 'v2', ..., priority: 'low' }
```

- Versions must be appended in sequence (`v2` after `v1`); the type system rejects gaps.
- Removing a field is `evolve('v3', { colour: null }, ...)`; renaming is a remove plus an add in the same step.
- A field may convert between a rich value and what is stored, such as `Schema.DateFromString`: code gets a `Date`, storage keeps the ISO string, and migrations receive values. Only the stored side is versioned and captured by a snapshot.
- Optional fields, `_`-prefixed keys, constructor defaults, and fields whose stored side is not plain JSON (such as `Schema.Date`) are refused at build time, so a snapshot can always describe what is stored.
- A check from the built-in catalogue (`isMinLength`, `isPattern`, `isInt`, `isBetween`, …) is recorded by itself. Any other filter needs `checkAnnotation({ name })`. Checks are shown in Studio but never compared, so adding or removing one is never a breaking change.

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

### Version a value that is not an object

A theme was free text and becomes one of two words. There is no object to hold `_v`, so `ValueESchema` stores the value in an envelope. Lifted from story 20.

```ts
import { Effect, Schema } from 'effect';
import { toSchema, ValueESchema } from 'std-toolkit/eschema';

const Theme = ValueESchema.make('Theme', Schema.String)
  .evolve('v2', Schema.Literals(['light', 'dark']), (text) =>
    text === 'night' ? 'dark' : 'light',
  )
  .build();

const stored = toSchema(Theme);
const read = Schema.decodeUnknownEffect(stored);

const seen = await Effect.runPromise(read({ _v: 'v1', _value: 'night' }));
// 'dark'

const written = await Effect.runPromise(Schema.encodeEffect(stored)(seen));
// { _v: 'v2', _value: 'dark' }

const legacy = await Effect.runPromise(read('night'));
// 'dark': a bare value is read as v1
```

- The envelope is `{ _v, _value }`. The `_value` key marks it, so stored data shows it belongs to a value schema. No schema kind may declare a top-level field starting with `_`, so no stored value can look like an envelope.
- An envelope must hold exactly `_v` (a string) and `_value`. Anything else fails with `ESchemaError`.
- A value without `_value` is read as v1, so adopting existing data needs no backfill. Once adopted, always write through the schema: a bare value is migrated from v1 again on every read.
