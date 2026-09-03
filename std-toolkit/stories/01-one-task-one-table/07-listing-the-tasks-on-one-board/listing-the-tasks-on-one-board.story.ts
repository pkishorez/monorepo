import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { fresh } from '../../env.js';
import { table } from '../02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { task } from '../03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// Four tasks on the `work` board, with ids that sort a1 < a2 < b1 < c1.
const seed = Effect.forEach(['a1', 'a2', 'b1', 'c1'], (taskId) =>
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

const idsOf = (page: {
  readonly items: readonly { readonly value: { readonly taskId: string } }[];
}) => page.items.map(({ value }) => value.taskId);

export const listingTheTasksOnOneBoard = Story.make({
  title: 'Listing the tasks on one board',
  description:
    'Read a whole board, read it backwards, read only a range of it, and see what an empty board returns.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do I read every task on a board?', {
      answer:
        'Query the board (a query is a read of one group, here one board) with the condition `>=: null`, which means "from the start". The tasks come back in id order, as a page: the `items`, plus `hasMore` saying whether any were left out.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Save the four tasks.
            yield* seed;
            // Read the whole `work` board from the start.
            const page = yield* task.query('primary', {
              pk: { boardId: 'work' },
              '>=': null,
            });
            yield* Story.assert(
              'the whole board comes back in id order',
              idsOf(page).join() === 'a1,a2,b1,c1',
            );
            yield* Story.assert('nothing was left out', page.hasMore === false);
            return { ids: idsOf(page), hasMore: page.hasMore };
          }),
        ),
      ),
    }),
    Story.question('How do I read it newest first, or only a slice of it?', {
      answer:
        'Seven conditions pick a slice by id: `=`, `<`, `<=`, `>`, `>=`, `between` and `beginsWith`, and `null` in place of an id means "no bound". The two "less than" conditions read backwards, so `<=: null` is the whole board newest first; every other condition reads forwards.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Save the four tasks.
            yield* seed;
            const pk = { boardId: 'work' };
            // Each condition, and the ids it returns in the order it returns them.
            const slices = {
              '<= null (newest first)': idsOf(
                yield* task.query('primary', { pk, '<=': null }),
              ),
              '< b1': idsOf(
                yield* task.query('primary', { pk, '<': { taskId: 'b1' } }),
              ),
              '= b1': idsOf(
                yield* task.query('primary', { pk, '=': { taskId: 'b1' } }),
              ),
              '> b1': idsOf(
                yield* task.query('primary', { pk, '>': { taskId: 'b1' } }),
              ),
              '>= b1': idsOf(
                yield* task.query('primary', { pk, '>=': { taskId: 'b1' } }),
              ),
              'between a2 and b1': idsOf(
                yield* task.query('primary', {
                  pk,
                  between: [{ taskId: 'a2' }, { taskId: 'b1' }],
                }),
              ),
              'beginsWith a': idsOf(
                yield* task.query('primary', {
                  pk,
                  beginsWith: { taskId: 'a' },
                }),
              ),
            };
            yield* Story.assert(
              'the less-than conditions read backwards',
              slices['<= null (newest first)'].join() === 'c1,b1,a2,a1' &&
                slices['< b1'].join() === 'a2,a1',
            );
            yield* Story.assert(
              'every other condition reads forwards and picks its slice',
              slices['= b1'].join() === 'b1' &&
                slices['> b1'].join() === 'c1' &&
                slices['>= b1'].join() === 'b1,c1' &&
                slices['between a2 and b1'].join() === 'a2,b1' &&
                slices['beginsWith a'].join() === 'a1,a2',
            );
            return slices;
          }),
        ),
      ),
    }),
    Story.question('What does an empty board give me?', {
      answer:
        'An empty page: no items and `hasMore: false`. An empty board is a value, not a failure.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Save the four tasks, all on `work`.
            yield* seed;
            // Read a board nothing was ever saved on.
            const page = yield* task.query('primary', {
              pk: { boardId: 'home' },
              '>=': null,
            });
            yield* Story.assert(
              'the empty board yields an empty page',
              page.items.length === 0 && page.hasMore === false,
            );
            return { ids: idsOf(page), hasMore: page.hasMore };
          }),
        ),
      ),
    }),
  ],
});
