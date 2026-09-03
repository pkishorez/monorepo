import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { Ulid } from 'std-toolkit/core';
import { DynamoDB, unmarshall } from 'std-toolkit/db/dynamodb';
import { table } from '../../01-one-task-one-table/02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { task } from '../../01-one-task-one-table/03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';

// A brand-new table on the local DynamoDB (port 8090) for every run, deleted afterwards even if the program fails; stamps count up from one.
let run = 0;
const onDynamoDB = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const dynamodb = DynamoDB.make(table, {
      tableName: `board-consistent-read-${process.pid}-${++run}`,
      region: 'local',
      endpoint: process.env.DYNAMODB_LOCAL_ENDPOINT ?? 'http://localhost:8090',
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    });
    yield* dynamodb.setup;
    let issued = 0;
    return yield* program.pipe(
      Effect.provide(dynamodb.layer),
      Effect.provideService(Ulid, () => String(++issued).padStart(26, '0')),
      Effect.ensuring(Effect.orDie(dynamodb.teardown)),
    );
  });

// The task this story saves, and its physical key: entity name and board for the partition, id for the sort.
const draft = {
  taskId: 't1',
  boardId: 'work',
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;
const physicalKey = { pk: 'Task#work', sk: 't1' };

export const readingWhatWasJustWritten = Story.make({
  title: 'Reading what was just written',
  description:
    'A consistent read answers from the copy that took the write. The native read that offers it returns the raw row, not a task.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do I ask for a read that is certain to be current?', {
      answer:
        'With `DynamoDB.getItem` and `consistentRead: true`, which makes DynamoDB answer from the copy that took the write rather than one that may lag behind it. DynamoDB keeps several copies of your data, which is why this switch exists there; SQLite and IndexedDB always read what was last committed.',
      proof: onDynamoDB(
        Story.trace(
          Effect.gen(function* () {
            // Save the task.
            yield* task.insert(draft);
            // Read its raw row, insisting on the current copy.
            const output = yield* DynamoDB.getItem(
              table.logicalName,
              physicalKey,
              {
                consistentRead: true,
              },
            );
            // Turn the raw row into a plain object.
            const row = unmarshall(
              (output.Item ?? {}) as Parameters<typeof unmarshall>[0],
            );
            yield* Story.assert(
              'the row just written is there, title included',
              output.Item !== undefined &&
                (row.data as { title: string }).title === 'Write the plan',
            );
            return { row };
          }),
        ),
      ),
    }),
    Story.question('What does a native read hand back?', {
      answer:
        "The physical row, in DynamoDB wire form: each attribute is wrapped in its type (`pk` arrives as `{ S: 'Task#work' }`), the bookkeeping columns sit beside the key, and your task is under `data`. No shape check and no migration happen; that is the price of the native read.",
      proof: onDynamoDB(
        Story.trace(
          Effect.gen(function* () {
            // Save the task.
            yield* task.insert(draft);
            // Read its raw row.
            const output = yield* DynamoDB.getItem(
              table.logicalName,
              physicalKey,
              {
                consistentRead: true,
              },
            );
            const raw = output.Item ?? {};
            // The columns the physical row carries.
            const columns = Object.keys(raw).sort();
            yield* Story.assert(
              'the wire form wraps each value in its type',
              Object.keys(raw.pk ?? {}).join() === 'S',
            );
            yield* Story.assert(
              'the row carries the keys, the bookkeeping columns and the data side by side',
              ['_d', '_e', '_u', '_v', 'data', 'pk', 'sk'].every((column) =>
                columns.includes(column),
              ),
            );
            return { columns, pk: raw.pk };
          }),
        ),
      ),
    }),
  ],
});
