import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { fresh } from '../../env.js';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';
import { table } from '../../01-one-task-one-table/02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';

// The same table, built again with one extra slot: `LSI1`, whose sort attribute is `LSI1SK`.
export const tableWithTitleIndex = StdTable.make('board')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .build();

// Task attached to the new table, with a second way in: `byTitle` fills the slot with the title.
export const taskByTitle = tableWithTitleIndex
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .index('LSI1', 'byTitle', { sk: ['title'] })
  .build();

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', tableWithTitleIndex);

// Four tasks on the `work` board, whose ids and titles sort in different orders.
const seed = Effect.forEach(
  [
    { taskId: 't1', title: 'Zebra' },
    { taskId: 't2', title: 'Apple' },
    { taskId: 't3', title: 'Mango' },
    { taskId: 't4', title: 'Apple' },
  ],
  ({ taskId, title }) =>
    taskByTitle.insert({
      taskId,
      boardId: 'work',
      title,
      status: 'open',
      assignee: null,
      colour: 'blue',
      notes: '',
    }),
);

const idsOf = (page: {
  readonly items: readonly { readonly value: { readonly taskId: string } }[];
}) => page.items.map(({ value }) => value.taskId);

export const listingTasksInADifferentOrder = Story.make({
  title: 'Listing tasks in a different order',
  description:
    'The same board read in title order instead of id order, and what that asks of the table.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The screen wants the tasks in title order, not id order. What is added?',
      {
        answer:
          'A second access pattern (a named way to read: which field groups the tasks and which field orders them). `byTitle` keeps `boardId` as the group and orders by `title`, so the same board can be read either way and each task is stored once.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save the four tasks.
              yield* seed;
              // Read the `work` board in id order, as before.
              const byId = yield* taskByTitle.query('primary', {
                pk: { boardId: 'work' },
                '>=': null,
              });
              // Read the same board in title order.
              const byTitle = yield* taskByTitle.query('byTitle', {
                pk: { boardId: 'work' },
                '>=': null,
              });
              yield* Story.assert(
                'the new pattern keeps the board as the group',
                taskByTitle.accessPatterns.byTitle.pk.join() === 'boardId' &&
                  taskByTitle.accessPatterns.byTitle.sk.join() === 'title',
              );
              yield* Story.assert(
                'the same tasks come back in title order',
                idsOf(byId).join() === 't1,t2,t3,t4' &&
                  idsOf(byTitle).join() === 't2,t4,t3,t1',
              );
              return { byId: idsOf(byId), byTitle: idsOf(byTitle) };
            }),
          ),
        ),
      },
    ),
    Story.question('Why did that mean building the table again?', {
      answer:
        "Because an index slot (a spare pair of key attributes the table keeps ready for another order) is part of the table's shape, declared up front like `pk` and `sk`. The table from chapter 2 has no slot, so this chapter builds one with `LSI1` and attaches Task to it again.",
      proof: Effect.gen(function* () {
        yield* Story.assert(
          'the first table has no slot to spare',
          Object.keys(table.localSecondaryIndexes).length === 0,
        );
        yield* Story.assert(
          'the new table has one, and the pattern lives in it',
          tableWithTitleIndex.localSecondaryIndexes.LSI1.sk === 'LSI1SK' &&
            taskByTitle.accessPatterns.byTitle.index === 'LSI1',
        );
        // The slot as declared, and the pattern that fills it.
        return {
          slot: tableWithTitleIndex.localSecondaryIndexes.LSI1,
          pattern: taskByTitle.accessPatterns.byTitle,
        };
      }),
    }),
    Story.question(
      'Same board, different order. What stays the same, and what if two titles match?',
      {
        answer:
          'The task itself: both ways in return the same stored task with the same update stamp, and the seven sort conditions work on the title just as they did on the id. Two tasks with the same title sit next to each other and still page correctly, because the id breaks the tie.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save the four tasks.
              yield* seed;
              const pk = { boardId: 'work' };
              // Read the title `Zebra` by title, and the same task by id.
              const [zebra] = (yield* taskByTitle.query('byTitle', {
                pk,
                '=': { title: 'Zebra' },
              })).items;
              const byKey = yield* taskByTitle.get({ taskId: 't1', ...pk });
              // Read the titles that start with `M`.
              const m = yield* taskByTitle.query('byTitle', {
                pk,
                beginsWith: { title: 'M' },
              });
              // Page through the board by title, one task at a time, across the two `Apple`s.
              const first = yield* taskByTitle.query(
                'byTitle',
                {
                  pk,
                  '>=': null,
                },
                { limit: 1 },
              );
              const second = yield* taskByTitle.query(
                'byTitle',
                {
                  pk,
                  '>=': null,
                },
                { limit: 1, after: first.items[0]! },
              );
              const third = yield* taskByTitle.query(
                'byTitle',
                {
                  pk,
                  '>=': null,
                },
                { limit: 1, after: second.items[0]! },
              );
              yield* Story.assert(
                'both ways in return the same stored task',
                zebra?.value.taskId === 't1' &&
                  zebra.meta._u === byKey?.meta._u,
              );
              yield* Story.assert(
                'a prefix on the title works like a prefix on the id',
                idsOf(m).join() === 't3',
              );
              yield* Story.assert(
                'the two matching titles page without a skip or a repeat',
                [...idsOf(first), ...idsOf(second), ...idsOf(third)].join() ===
                  't2,t4,t3',
              );
              return {
                zebra,
                byKey,
                startsWithM: idsOf(m),
                pages: [idsOf(first), idsOf(second), idsOf(third)],
              };
            }),
          ),
        ),
      },
    ),
  ],
});
