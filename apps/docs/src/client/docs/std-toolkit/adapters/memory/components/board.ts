import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

export const table = StdTable.make('board').primary('pk', 'sk').build();
export const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

// The program names no database: it needs the 'board' table, nothing more.
export const titles = task
  .query('primary', { pk: { boardId: 'work' }, '>=': null })
  .pipe(Effect.map((page) => page.items.map((item) => item.value.title)));

// Memory.make gives that table a home in memory. Its layer is the answer.
export const run = () => {
  const memory = Memory.make(table);
  return Effect.runPromise(
    task
      .insert({ boardId: 'work', taskId: 't1', title: 'Plan the week' })
      .pipe(Effect.andThen(titles), Effect.provide(memory.layer)),
  );
};
