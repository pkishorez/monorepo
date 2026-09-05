import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { fresh } from '../../env.js';
import { Task } from '../01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';
import { table } from '../02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';

// Task, attached to the table: `boardId` fills the partition key, and the sort key is the task's own id.
export const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// Two tasks on the `work` board and one on `home`.
const seed = Effect.forEach(
  [
    { taskId: 't1', boardId: 'work', title: 'Write the plan' },
    { taskId: 't2', boardId: 'work', title: 'Review it' },
    { taskId: 't3', boardId: 'home', title: 'Buy milk' },
  ],
  ({ taskId, boardId, title }) =>
    task.insert({
      taskId,
      boardId,
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

export const tellingTheTableWhereEachTaskGoes = Story.make({
  title: 'Telling the table where each task goes',
  description:
    'Task is attached to the table. Its `boardId` decides which group a task lands in; its `taskId` orders it there.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Two tasks are on the board called `work` and one is on `home`. What decides where each goes?',
      {
        answer:
          'The attachment names `boardId` as the partition key, so tasks on one board stay together as one group (an entity is a kind of thing the table stores, and Task is the first). Reading a whole board is then one read of that group, not a search through everything.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save the three tasks.
              yield* seed;
              // Read everything on the `work` board.
              const work = yield* task.query('primary', {
                pk: { boardId: 'work' },
                '>=': null,
              });
              // Read everything on the `home` board.
              const home = yield* task.query('primary', {
                pk: { boardId: 'home' },
                '>=': null,
              });
              yield* Story.assert(
                'the partition key is built from boardId',
                task.primary.pk.join() === 'boardId',
              );
              yield* Story.assert(
                'the two work tasks came back together',
                idsOf(work).join() === 't1,t2',
              );
              yield* Story.assert(
                'and the home task was not among them',
                idsOf(home).join() === 't3',
              );
              return {
                partitionKey: task.primary.pk,
                work: idsOf(work),
                home: idsOf(home),
              };
            }),
          ),
        ),
      },
    ),
    Story.question('What orders the tasks inside one board?', {
      answer:
        'The identity field Task declared, `taskId`: an entity always sorts by its own id, so you never choose the sort key. Each task therefore has exactly one address on its board.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Save the three tasks.
            yield* seed;
            // Read the work tasks whose id starts with `t1`.
            const matching = yield* task.query('primary', {
              pk: { boardId: 'work' },
              beginsWith: { taskId: 't1' },
            });
            yield* Story.assert(
              'the sort key is the declared id field',
              task.primary.sk.join() === 'taskId',
            );
            yield* Story.assert(
              'so a task can be addressed by its own id',
              idsOf(matching).join() === 't1',
            );
            return { sortKey: task.primary.sk, matching: idsOf(matching) };
          }),
        ),
      ),
    }),
  ],
});
