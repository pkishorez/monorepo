import { Effect, Stream } from 'effect';
import { Story } from 'laymos/story';
import { fresh } from '../../env.js';
import { table } from '../02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { task } from '../03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// A board with 101 tasks: t001 … t101.
const ids = Array.from(
  { length: 101 },
  (_, index) => `t${String(index + 1).padStart(3, '0')}`,
);
const seed = Effect.forEach(ids, (taskId) =>
  task.insert({
    taskId,
    boardId: 'work',
    title: `Task ${taskId}`,
    status: 'open',
    assignee: null,
    colour: 'blue',
    notes: '',
  }),
);

const wholeBoard = { pk: { boardId: 'work' }, '>=': null } as const;

const idsOf = (page: {
  readonly items: readonly { readonly value: { readonly taskId: string } }[];
}) => page.items.map(({ value }) => value.taskId);

export const readingALongListOnePageAtATime = Story.make({
  title: 'Reading a long list one page at a time',
  description:
    'A query always answers with a page. This chapter reads a long board page by page, to the end, without missing or repeating a task.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('The board has hundreds of tasks. How many arrive?', {
      answer:
        'One hundred, the default page size, with `hasMore: true` to say the board goes on. Give `limit` to get a smaller page; either way the page tells you whether tasks remain.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Save all 101 tasks.
            yield* seed;
            // Ask for the whole board with no limit.
            const page = yield* task.query('primary', wholeBoard);
            // Ask for three at a time.
            const small = yield* task.query('primary', wholeBoard, {
              limit: 3,
            });
            yield* Story.assert(
              'a query over 101 tasks returns 100 and says more remain',
              page.items.length === 100 && page.hasMore,
            );
            yield* Story.assert(
              'a limit of three returns the first three and says more remain',
              idsOf(small).join() === 't001,t002,t003' && small.hasMore,
            );
            return {
              count: page.items.length,
              hasMore: page.hasMore,
              small: { ids: idsOf(small), hasMore: small.hasMore },
            };
          }),
        ),
      ),
    }),
    Story.question(
      'How do I read the next page, and how do I know I have reached the end?',
      {
        answer:
          'Pass the last task of the page you have as `after`; there is no cursor to keep, and each task is read once. Past the end you get an empty page with `hasMore: false`, never a failure; to walk the whole table rather than one board, `table.scan()` streams every row.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save all 101 tasks.
              yield* seed;
              // Read the board forty at a time until nothing remains.
              const seen: string[] = [];
              let pages = 0;
              let page = yield* task.query('primary', wholeBoard, {
                limit: 40,
              });
              seen.push(...idsOf(page));
              pages += 1;
              while (page.hasMore) {
                page = yield* task.query('primary', wholeBoard, {
                  limit: 40,
                  after: page.items.at(-1)!,
                });
                seen.push(...idsOf(page));
                pages += 1;
              }
              // Ask for the page after the very last task.
              const past = yield* task.query('primary', wholeBoard, {
                after: page.items.at(-1)!,
              });
              // Walk every row in the whole table, board by board.
              const everyRow = yield* Stream.runCollect(table.scan());
              yield* Story.assert(
                'three pages see all 101 tasks once each',
                pages === 3 &&
                  seen.length === 101 &&
                  new Set(seen).size === 101,
              );
              yield* Story.assert(
                'the page past the end is empty and final',
                past.items.length === 0 && past.hasMore === false,
              );
              yield* Story.assert(
                'the whole table holds the same 101 rows',
                everyRow.length === 101,
              );
              return {
                pages,
                first: seen[0],
                last: seen.at(-1),
                past: { count: past.items.length, hasMore: past.hasMore },
                wholeTable: everyRow.length,
              };
            }),
          ),
        ),
      },
    ),
    Story.question(
      'Some tasks are deleted, and some sort the same. Can a page come up short, skip one, or repeat one?',
      {
        answer:
          "No: `limit` counts the tasks you receive, so a page of live tasks arrives full even with deleted ones in between, and a walk sees each live task once. Two tasks on a board can never sort the same, because the sort key is the task's own id.",
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save all 101 tasks, then delete two near the start.
              yield* seed;
              yield* task.delete({ taskId: 't002', boardId: 'work' });
              yield* task.delete({ taskId: 't004', boardId: 'work' });
              // A page of three live tasks is still three tasks.
              const page = yield* task.query('primary', wholeBoard, {
                limit: 3,
                excludeDeleted: true,
              });
              // Walk every live task, twenty-five at a time.
              const seen: string[] = [];
              let next = yield* task.query('primary', wholeBoard, {
                limit: 25,
                excludeDeleted: true,
              });
              seen.push(...idsOf(next));
              while (next.hasMore) {
                next = yield* task.query('primary', wholeBoard, {
                  limit: 25,
                  excludeDeleted: true,
                  after: next.items.at(-1)!,
                });
                seen.push(...idsOf(next));
              }
              yield* Story.assert(
                'the page skips both deleted tasks and is still full',
                idsOf(page).join() === 't001,t003,t005',
              );
              yield* Story.assert(
                'the walk sees the 99 live tasks once each',
                seen.length === 99 && new Set(seen).size === 99,
              );
              yield* Story.assert(
                'ids cannot tie because the sort key is the id itself',
                task.primary.sk.join() === 'taskId',
              );
              return {
                page: idsOf(page),
                live: seen.length,
                unique: new Set(seen).size,
                sortKey: task.primary.sk,
              };
            }),
          ),
        ),
      },
    ),
  ],
});
