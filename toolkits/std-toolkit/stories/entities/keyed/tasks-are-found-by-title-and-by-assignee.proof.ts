import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  assignee: Schema.String,
}).build();

// An LSI orders a board differently; a GSI reaches across boards.
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

export default Proof.make({
  title:
    'A board lists its tasks by title, and a person finds every task assigned to them',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const tasks = [
      { taskId: 't1', boardId: 'work', title: 'Review', assignee: 'ana' },
      { taskId: 't2', boardId: 'work', title: 'Plan', assignee: 'ben' },
      { taskId: 't3', boardId: 'work', title: 'Ship', assignee: 'ana' },
      { taskId: 't4', boardId: 'home', title: 'Cook', assignee: 'ana' },
    ];
    yield* Effect.forEach(tasks, (value) => task.insert(value)).pipe(
      Effect.provide(db.layer),
    );
    yield* Proof.assert('four tasks over two boards', tasks.length === 4);
    return { db, tasks };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const byTitle = yield* task.query('byTitle', {
        pk: { boardId: 'work' },
        '>=': null,
      });
      const anasTasks = yield* task.query('byAssignee', {
        pk: { assignee: 'ana' },
        '>=': null,
      });
      const anasWork = yield* task.query('byAssignee', {
        pk: { assignee: 'ana' },
        beginsWith: { boardId: 'work', title: '' },
      });
      const titles = (page: typeof byTitle) =>
        page.items.map(({ value }) => value.title);
      return {
        byTitle: titles(byTitle),
        anasTasks: titles(anasTasks),
        anasWork: titles(anasWork),
      };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ byTitle, anasTasks, anasWork }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the work board lists by title',
        byTitle.join() === 'Plan,Review,Ship',
      );
      yield* Proof.assert(
        "Ana's tasks come from both boards, ordered by board then title",
        anasTasks.join() === 'Cook,Review,Ship',
      );
      yield* Proof.assert(
        'a beginsWith on the GSI sort key narrows to one board',
        anasWork.join() === 'Review,Ship',
      );
    }),
});
