import { Console, Effect, Layer, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  assignee: Schema.String,
}).build();

// An LSI orders a board another way; a GSI reaches across boards.
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .index('LSI1', 'byTitle', { sk: ['title'] })
  .index('GSI1', 'byAssignee', { pk: ['assignee'], sk: ['boardId', 'title'] })
  .build();

const titles = (page: {
  readonly items: ReadonlyArray<{ readonly value: { readonly title: string } }>;
}) => page.items.map(({ value }) => value.title).join(', ');

export const program = Effect.gen(function* () {
  yield* Effect.forEach(
    [
      { taskId: 't1', boardId: 'work', title: 'Review', assignee: 'ana' },
      { taskId: 't2', boardId: 'work', title: 'Plan', assignee: 'ben' },
      { taskId: 't3', boardId: 'work', title: 'Ship', assignee: 'ana' },
      { taskId: 't4', boardId: 'home', title: 'Cook', assignee: 'ana' },
    ],
    (value) => task.insert(value),
  );

  const byId = yield* task.query('primary', {
    pk: { boardId: 'work' },
    '>=': null,
  });
  yield* Console.log('work, by id:', titles(byId));

  const byTitle = yield* task.query('byTitle', {
    pk: { boardId: 'work' },
    '>=': null,
  });
  yield* Console.log('work, by title:', titles(byTitle));

  const anas = yield* task.query('byAssignee', {
    pk: { assignee: 'ana' },
    '>=': null,
  });
  yield* Console.log("ana's, every board:", titles(anas));

  const anasWork = yield* task.query('byAssignee', {
    pk: { assignee: 'ana' },
    beginsWith: { boardId: 'work', title: '' },
  });
  yield* Console.log("ana's, on work:", titles(anasWork));
}).pipe(Effect.provide(Layer.suspend(() => Memory.make(table).layer)));
