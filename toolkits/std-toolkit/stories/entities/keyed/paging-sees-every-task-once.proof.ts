import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

const wholeBoard = { pk: { boardId: 'work' }, '>=': null } as const;

export default Proof.make({
  title: 'Paging through a long board sees every live task exactly once',
  description:
    'A page holds at most 100 tasks by default; passing the last task as `after` reads the next page. Tombstones do not make a page short.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const ids = Array.from(
      { length: 101 },
      (_, i) => `t${String(i + 1).padStart(3, '0')}`,
    );
    yield* Effect.forEach(ids, (taskId) =>
      task.insert({ taskId, boardId: 'work', title: `Task ${taskId}` }),
    ).pipe(Effect.provide(db.layer));
    yield* task
      .delete({ boardId: 'work', taskId: 't002' })
      .pipe(Effect.provide(db.layer));
    const first = yield* task
      .query('primary', wholeBoard)
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      'the default page holds 100 and says more remain',
      first.items.length === 100 && first.hasMore,
    );
    return { db, stored: ids.length, deleted: ['t002'] };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const pages: string[][] = [];
      let page = yield* task.query('primary', wholeBoard, {
        limit: 40,
        excludeDeleted: true,
      });
      pages.push(page.items.map(({ value }) => value.taskId));
      while (page.hasMore) {
        page = yield* task.query('primary', wholeBoard, {
          limit: 40,
          excludeDeleted: true,
          after: page.items.at(-1)!,
        });
        pages.push(page.items.map(({ value }) => value.taskId));
      }
      return { pageSizes: pages.map((ids) => ids.length), seen: pages.flat() };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ pageSizes, seen }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'pages are full until the last',
        pageSizes.join() === '40,40,20',
      );
      yield* Proof.assert(
        'all 100 live tasks were seen once each, in id order',
        seen.length === 100 &&
          new Set(seen).size === 100 &&
          seen[0] === 't001' &&
          seen[1] === 't003',
      );
      yield* Proof.assert(
        'the deleted task never appeared',
        !seen.includes('t002'),
      );
      yield* Proof.budget('StdTable.query', '50 millis');
    }),
});
