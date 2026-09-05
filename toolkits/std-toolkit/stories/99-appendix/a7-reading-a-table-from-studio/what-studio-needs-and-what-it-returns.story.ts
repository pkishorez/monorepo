import { Effect, Schema } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';
import { StudioRpc } from 'std-toolkit/studio-rpc';
import { fresh } from '../../env.js';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';
import {
  table,
  task,
} from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';
import { settings } from '../../02-more-ways-in/12-one-record-that-exists-exactly-once/one-record-that-exists-exactly-once.story.js';

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// Four tasks on the work board, in a known title order.
const seed = Effect.forEach(
  ['alpha', 'alphabet', 'beta', 'gamma'],
  (title, index) =>
    task.insert({
      taskId: `t${index + 1}`,
      boardId: 'work',
      title,
      status: 'open',
      assignee: null,
      colour: 'blue',
      notes: '',
    }),
);

// The same table as the app knew it last year, with the chapter 1 Task, and as it knows it now, with a v2 Task.
const lastYear = StdTable.make('board').primary('pk', 'sk').build();
const today = StdTable.make('board').primary('pk', 'sk').build();
const TaskV2 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
  assignee: Schema.NullOr(Schema.String),
  colour: Schema.String,
  notes: Schema.String,
})
  .evolve(
    'v2',
    { priority: Schema.Literals(['low', 'normal', 'high']) },
    (previous) => ({
      ...previous,
      priority: 'normal' as const,
    }),
  )
  .build();
const oldTask = lastYear
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
today
  .entity(TaskV2)
  .primary({ pk: ['boardId'] })
  .build();

export const whatStudioNeedsAndWhatItReturns = Story.make({
  title: 'What Studio needs, and what it returns',
  description:
    'One read-only RPC group, added to your server, lets Studio discover the table and read it with the same patterns your code uses.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What does Studio need to know before it can read my table?',
      {
        answer:
          "Only where the RPC lives: `StudioRpc.layer(table)` is added to your server once, and the first call, `Studio.GetTableSnapshot`, tells Studio the table's name, every entity in it and their shapes. Nothing table-specific is generated on either side.",
        proof: onBoard(
          Story.trace(
            Effect.scoped(
              Effect.gen(function* () {
                // A Studio client talking to the RPC group, in process.
                const client = yield* RpcTest.makeClient(StudioRpc);
                // Discover the table.
                const snapshot = yield* client['Studio.GetTableSnapshot']();
                // Read the one-of-a-kind settings record, which needs no key.
                const current = yield* client['Studio.GetEntity']({
                  entity: settings.name,
                });
                yield* Story.assert(
                  'the snapshot names the table and its entities',
                  snapshot.logicalName === 'board' &&
                    snapshot.entities.some(({ name }) => name === 'Task') &&
                    snapshot.entities.some(({ name }) => name === 'Settings'),
                );
                yield* Story.assert(
                  'a single entity reads as its default, stamped with its version',
                  current?.value._v === 'v1',
                );
                return {
                  logicalName: snapshot.logicalName,
                  entities: snapshot.entities.map(({ name }) => name),
                  settings: current?.value,
                };
              }),
            ).pipe(Effect.provide(StudioRpc.layer(table))),
          ),
        ),
      },
    ),
    Story.question('How does Studio read the tasks on a board?', {
      answer:
        'With `Studio.QueryEntities`, naming the entity and one of its patterns, exactly as your code would: the same sort conditions, pages resumed by handing back the last row, and deleted tasks left visible so you can see them.',
      proof: onBoard(
        Story.trace(
          Effect.scoped(
            Effect.gen(function* () {
              // Four tasks, one of them deleted.
              yield* seed;
              yield* task.delete({ taskId: 't3', boardId: 'work' });
              // A Studio client talking to the RPC group, in process.
              const client = yield* RpcTest.makeClient(StudioRpc);
              // The work board in title order, whole and narrowed by a prefix.
              const all = yield* client['Studio.QueryEntities']({
                entity: 'Task',
                accessPattern: 'byTitle',
                pk: { boardId: 'work' },
              });
              const alphas = yield* client['Studio.QueryEntities']({
                entity: 'Task',
                accessPattern: 'byTitle',
                pk: { boardId: 'work' },
                sk: { operator: 'beginsWith', value: { title: 'alpha' } },
              });
              // Two at a time, resuming from the last row of the first page.
              const first = yield* client['Studio.QueryEntities']({
                entity: 'Task',
                accessPattern: 'byTitle',
                pk: { boardId: 'work' },
                limit: 2,
              });
              const second = yield* client['Studio.QueryEntities']({
                entity: 'Task',
                accessPattern: 'byTitle',
                pk: { boardId: 'work' },
                limit: 2,
                after: first.items.at(-1)!,
              });
              const titles = (page: typeof all) =>
                page.items.map(({ value }) => value.title);
              yield* Story.assert(
                'the pattern and its conditions work as they do in code',
                titles(all).join() === 'alpha,alphabet,beta,gamma' &&
                  titles(alphas).join() === 'alpha,alphabet',
              );
              yield* Story.assert(
                'pages resume from the last row, and the deleted task stays visible',
                [...titles(first), ...titles(second)].join() ===
                  'alpha,alphabet,beta,gamma' &&
                  all.items.find(({ value }) => value.title === 'beta')?.meta
                    ._d === true,
              );
              return {
                all: titles(all),
                alphas: titles(alphas),
                pages: [titles(first), titles(second)],
                hasMore: [first.hasMore, second.hasMore],
              };
            }),
          ).pipe(Effect.provide(StudioRpc.layer(table))),
        ),
      ),
    }),
    Story.question(
      'What does Studio show for a task written at an old version?',
      {
        answer:
          'The task as the app sees it today: the ordinary read walks the row up to the newest version in memory, and Studio sends that result stamped with the newest version. The stored row is not rewritten.',
        proof: fresh(
          'memory',
          lastYear,
        )(
          Story.trace(
            Effect.scoped(
              Effect.gen(function* () {
                // Save a task through last year's shape.
                yield* oldTask.insert({
                  taskId: 't1',
                  boardId: 'work',
                  title: 'Write the plan',
                  status: 'open',
                  assignee: null,
                  colour: 'blue',
                  notes: '',
                });
                // Read it through Studio, which serves today's table.
                const client = yield* RpcTest.makeClient(StudioRpc);
                const read = yield* client['Studio.GetEntity']({
                  entity: 'Task',
                  key: { taskId: 't1', boardId: 'work' },
                });
                yield* Story.assert(
                  'Studio returns the task at the newest version, migrated',
                  read?.value._v === 'v2' && read.value.priority === 'normal',
                );
                return { read };
              }),
            ).pipe(Effect.provide(StudioRpc.layer(today))),
          ),
        ),
      },
    ),
  ],
});
