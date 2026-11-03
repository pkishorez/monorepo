import { Console, Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

const PAGE = 2;

// Every task on the board, oldest change first.
const changes = task
  .query('primary', { pk: { boardId: 'work' }, '>=': null })
  .pipe(
    Effect.map((page) =>
      page.items.toSorted((a, b) => (a.meta._u < b.meta._u ? -1 : 1)),
    ),
  );

// A fetch the way a strategy wants it: strictly after the cursor.
const fetch = (after: string | null) =>
  changes.pipe(
    Effect.map((all) =>
      all
        .filter((item) => after === null || item.meta._u > after)
        .slice(0, PAGE),
    ),
  );

// The same fetch, written with >= by mistake.
const inclusive = (after: string | null) =>
  changes.pipe(
    Effect.map((all) =>
      all
        .filter((item) => after === null || item.meta._u >= after)
        .slice(0, PAGE),
    ),
  );

type Page = ReadonlyArray<{
  readonly value: { readonly title: string };
  readonly meta: { readonly _u: string };
}>;

const short = (items: Page) =>
  items.map((item) => ({ title: item.value.title, _u: item.meta._u }));

export const program = Effect.gen(function* () {
  for (const [n, title] of [
    'Plan the week',
    'Water the plants',
    'Call home',
    'Fix the bike',
    'Book the dentist',
  ].entries())
    yield* task.insert({ boardId: 'work', taskId: `t${n + 1}`, title });

  // oldToNew: page after page from the oldest, each after the last one read.
  let cursor: string | null = null;
  for (let page = 1; ; page++) {
    const items: Page = yield* fetch(cursor);
    yield* Console.log(
      `page ${page}, after ${cursor ?? 'nothing'}`,
      short(items),
    );
    if (items.length === 0) break;
    cursor = items.at(-1)!.meta._u;
  }

  // With >=, the page after t2 starts with t2 again.
  const first = yield* inclusive(null);
  const again = yield* inclusive(first.at(-1)!.meta._u);
  yield* Console.log('with >=, the next page repeats', short(again));
  return 'caught up: the cursor is the newest _u read';
}).pipe(Effect.provide(Memory.make(table).layer));
