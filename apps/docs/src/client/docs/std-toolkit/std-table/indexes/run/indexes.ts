import { Console, Effect, Layer, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

// Task at v2: it has a priority.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

// The table declares two index slots: an LSI and a GSI.
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

// Task names what each slot means for it.
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .index('LSI1', 'byTitle', { sk: ['title'] })
  .index('GSI1', 'byPriority', { pk: ['priority'], sk: ['boardId', 'title'] })
  .build();

// The titles, in the order the query gave them, then the tasks themselves.
const found = (page: {
  readonly items: ReadonlyArray<{ readonly value: { readonly title: string } }>;
}) => [
  page.items.map((item) => item.value.title),
  page.items.map((item) => item.value),
];

export const program = Effect.gen(function* () {
  yield* Effect.forEach(
    [
      {
        taskId: 't1',
        boardId: 'work',
        title: 'Water the plants',
        priority: 'high',
      },
      {
        taskId: 't2',
        boardId: 'work',
        title: 'Plan the week',
        priority: 'low',
      },
      { taskId: 't3', boardId: 'work', title: 'Call home', priority: 'high' },
      {
        taskId: 't4',
        boardId: 'home',
        title: 'Fix the bike',
        priority: 'high',
      },
    ] as const,
    (value) => task.insert(value),
  );

  // The work board, by id: the primary key's order.
  const byId = yield* task.query('primary', {
    pk: { boardId: 'work' },
    '>=': null,
  });
  yield* Console.log('work, by id', ...found(byId));

  // The same board, by title: the LSI.
  const byTitle = yield* task.query('byTitle', {
    pk: { boardId: 'work' },
    '>=': null,
  });
  yield* Console.log('work, by title', ...found(byTitle));

  // Every high-priority task, on any board: the GSI.
  const high = yield* task.query('byPriority', {
    pk: { priority: 'high' },
    '>=': null,
  });
  yield* Console.log('high, every board', ...found(high));

  // High-priority tasks on the work board only: a prefix of the sort key.
  const highOnWork = yield* task.query('byPriority', {
    pk: { priority: 'high' },
    beginsWith: { boardId: 'work', title: '' },
  });
  yield* Console.log('high, on work', ...found(highOnWork));
}).pipe(Effect.provide(Layer.suspend(() => Memory.make(table).layer)));
