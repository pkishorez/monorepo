import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const v1 = {
  boardId: Schema.String,
  title: Schema.String,
  colour: Schema.String,
  notes: Schema.String,
};

// Release 1, as it shipped.
const TaskV1 = EntityESchema.make('Task', 'taskId', v1).build();

// Release 2: `notes` is removed, and `colour` is renamed `color`.
export const Task = EntityESchema.make('Task', 'taskId', v1)
  .evolve(
    'v2',
    { notes: null, colour: null, color: Schema.String },
    ({ notes, colour, ...rest }) => ({ ...rest, color: colour }),
  )
  .build();

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
