import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { fresh } from '../../env.js';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';

// The table every later chapter shares: the title slot from chapter 9, plus `GSI1`, a slot with its own partition attribute and sort attribute.
export const table = StdTable.make('board')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

// Task with both ways in: `byTitle` from chapter 9, and `byAssignee`, which groups by person and orders by status, then title.
export const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .index('LSI1', 'byTitle', { sk: ['title'] })
  .index('GSI1', 'byAssignee', { pk: ['assignee'], sk: ['status', 'title'] })
  .build();

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// Five tasks across two boards: three for Ana, one for Ben, one for nobody.
const seed = Effect.forEach(
  [
    {
      taskId: 't1',
      boardId: 'work',
      title: 'Write the plan',
      assignee: 'ana',
      status: 'open',
    },
    {
      taskId: 't2',
      boardId: 'work',
      title: 'Review it',
      assignee: 'ben',
      status: 'open',
    },
    {
      taskId: 't3',
      boardId: 'home',
      title: 'Buy milk',
      assignee: 'ana',
      status: 'done',
    },
    {
      taskId: 't4',
      boardId: 'home',
      title: 'Call the plumber',
      assignee: 'ana',
      status: 'open',
    },
    {
      taskId: 't5',
      boardId: 'work',
      title: 'Tidy the desk',
      assignee: null,
      status: 'open',
    },
  ] as const,
  ({ taskId, boardId, title, assignee, status }) =>
    task.insert({
      taskId,
      boardId,
      title,
      status,
      assignee,
      colour: 'blue',
      notes: '',
    }),
);

const idsOf = (page: {
  readonly items: readonly { readonly value: { readonly taskId: string } }[];
}) => page.items.map(({ value }) => value.taskId);

export const findingOnePersonsTasksAcrossEveryBoard = Story.make({
  title: "Finding one person's tasks across every board",
  description:
    'A way in that does not start from the board: group tasks by the person they are assigned to, across every board at once.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Ana has tasks on two boards. How do I read hers without reading every board?',
      {
        answer:
          'With a pattern whose group is a different field: `byAssignee` groups tasks by `assignee` instead of `boardId`, so one read returns her tasks from every board. That needs a slot with its own partition attribute, which is what `GSI1` adds to the table.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save the five tasks.
              yield* seed;
              // Read everything assigned to Ana, whichever board it is on.
              const ana = yield* task.query('byAssignee', {
                pk: { assignee: 'ana' },
                '>=': null,
              });
              yield* Story.assert(
                'the pattern groups by assignee, not by board',
                task.accessPatterns.byAssignee.pk.join() === 'assignee' &&
                  task.accessPatterns.byAssignee.index === 'GSI1',
              );
              yield* Story.assert(
                'her tasks come back from both boards',
                idsOf(ana).join() === 't3,t4,t1' &&
                  new Set(ana.items.map(({ value }) => value.boardId)).size ===
                    2,
              );
              return {
                ana: idsOf(ana),
                pattern: task.accessPatterns.byAssignee,
              };
            }),
          ),
        ),
      },
    ),
    Story.question(
      'One task is assigned to nobody. Where is it in the by-person index?',
      {
        answer:
          'Nowhere: a task whose `assignee` is `null` cannot make a key for that pattern, so it is simply left out of it (the index is sparse). It is still on its board, and a read by key still finds it.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save the five tasks.
              yield* seed;
              // Ask the by-person pattern for each person there is.
              const ana = yield* task.query('byAssignee', {
                pk: { assignee: 'ana' },
                '>=': null,
              });
              const ben = yield* task.query('byAssignee', {
                pk: { assignee: 'ben' },
                '>=': null,
              });
              // The unassigned task is still on its board, and still readable by key.
              const work = yield* task.query('primary', {
                pk: { boardId: 'work' },
                '>=': null,
              });
              const unassigned = yield* task.get({
                taskId: 't5',
                boardId: 'work',
              });
              yield* Story.assert(
                'no person lists the unassigned task',
                [...idsOf(ana), ...idsOf(ben)].includes('t5') === false,
              );
              yield* Story.assert(
                'the board still does, and so does a read by key',
                idsOf(work).includes('t5') &&
                  unassigned?.value.assignee === null,
              );
              return {
                ana: idsOf(ana),
                ben: idsOf(ben),
                work: idsOf(work),
                unassigned,
              };
            }),
          ),
        ),
      },
    ),
    Story.question("Only Ana's open tasks?", {
      answer:
        'The pattern orders by `status` and then `title`, so a `beginsWith` on the whole sort key with the status filled in and an empty title matches from the first field forward and returns only her open tasks, in title order. Every field of the sort key is always given, so a prefix always names a complete position.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Save the five tasks.
            yield* seed;
            const pk = { assignee: 'ana' };
            // Her open tasks: the status is fixed, the title is left open.
            const open = yield* task.query('byAssignee', {
              pk,
              beginsWith: { status: 'open', title: '' },
            });
            // Narrow further: her open tasks whose title starts with `W`.
            const openW = yield* task.query('byAssignee', {
              pk,
              beginsWith: { status: 'open', title: 'W' },
            });
            yield* Story.assert(
              'the sort key is status, then title',
              task.accessPatterns.byAssignee.sk.join() === 'status,title',
            );
            yield* Story.assert(
              'the prefix picks the status group, then narrows by title',
              idsOf(open).join() === 't4,t1' && idsOf(openW).join() === 't1',
            );
            return { open: idsOf(open), openStartingWithW: idsOf(openW) };
          }),
        ),
      ),
    }),
  ],
});
