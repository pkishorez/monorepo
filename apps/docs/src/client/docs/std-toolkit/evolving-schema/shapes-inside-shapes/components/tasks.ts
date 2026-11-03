import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import {
  ESchema,
  EntityESchema,
  ValueESchema,
} from '@kestack/std-toolkit/eschema';

// A checklist item: an object with fields, so an ESchema.
export const Item = ESchema.make('Item', {
  text: Schema.String,
  checked: Schema.Boolean,
}).build();

// Release 1 called an unstarted task 'todo'.
const StatusV1 = ValueESchema.make(
  'Status',
  Schema.Literals(['todo', 'done']),
).build();

// Release 2 calls it 'open'. Status gets a version; Task does not.
export const Status = ValueESchema.make(
  'Status',
  Schema.Literals(['todo', 'done']),
)
  .evolve('v2', Schema.Literals(['open', 'done']), (status) =>
    status === 'todo' ? 'open' : 'done',
  )
  .build();

// Each nests its shapes through their `schema`.
const fieldsWith = <S extends Schema.Top>(status: S) => ({
  boardId: Schema.String,
  title: Schema.String,
  status,
  checklist: Schema.Array(Item.schema),
});

const TaskV1 = EntityESchema.make(
  'Task',
  'taskId',
  fieldsWith(StatusV1.schema),
).build();
export const Task = EntityESchema.make(
  'Task',
  'taskId',
  fieldsWith(Status.schema),
).build();

// Both releases keep tasks in the one 'board' table.
const releaseOneTable = StdTable.make('board').primary('pk', 'sk').build();
export const release1 = releaseOneTable
  .entity(TaskV1)
  .primary({ pk: ['boardId'] })
  .build();

export const table = StdTable.make('board').primary('pk', 'sk').build();
export const release2 = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

export const board = release2
  .query('primary', { pk: { boardId: 'work' }, '>=': null })
  .pipe(Effect.map((page) => page.items.map((item) => item.value)));
