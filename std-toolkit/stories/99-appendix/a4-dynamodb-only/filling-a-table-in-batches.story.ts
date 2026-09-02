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
      tableName: `board-batches-${process.pid}-${++run}`,
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

// The physical key of a task on the `work` board: the entity name and board make the partition key, the id is the sort key.
const physicalKey = (taskId: string) => ({ pk: 'Task#work', sk: taskId });

// A raw DynamoDB item, turned back into a plain object.
const plain = (item: object | undefined) =>
  unmarshall((item ?? {}) as Parameters<typeof unmarshall>[0]);

export const fillingATableInBatches = Story.make({
  title: 'Filling a table in batches',
  description:
    'A batch write sends raw rows in groups of twenty-five to cut network calls. It skips everything the ordinary write does for you.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do I fill a table faster than one write at a time?', {
      answer:
        'With `DynamoDB.batchInsert`, which sends raw rows in groups of twenty-five (the DynamoDB limit) and reports anything the database did not take. It exists to save network round trips, which is why only DynamoDB has it: SQLite and IndexedDB run in the same process and have no round trips to save.',
      proof: onDynamoDB(
        Story.trace(
          Effect.gen(function* () {
            // Save one task the ordinary way, to use as a template.
            yield* task.insert({
              taskId: 't00',
              boardId: 'work',
              title: 'Template',
              status: 'open',
              assignee: null,
              colour: 'blue',
              notes: '',
            });
            // Read its raw row, exactly as DynamoDB stores it.
            const fetched = yield* DynamoDB.getItem(
              table.logicalName,
              physicalKey('t00'),
            );
            const template = plain(fetched.Item);
            // Thirty copies of that row, each with its own id.
            const rows = Array.from({ length: 30 }, (_, index) => {
              const taskId = `t${String(index + 1).padStart(2, '0')}`;
              return {
                ...template,
                sk: taskId,
                data: { ...(template.data as Record<string, unknown>), taskId },
              };
            });
            // Send them in batches; what comes back is whatever DynamoDB did not take.
            const batch = yield* DynamoDB.batchInsert(table.logicalName, rows);
            // Read the board through the ordinary query.
            const work = yield* task.query('primary', {
              pk: { boardId: 'work' },
              '>=': null,
            });
            const spotCheck = yield* task.get({
              taskId: 't17',
              boardId: 'work',
            });
            yield* Story.assert(
              'nothing was left unprocessed',
              batch.UnprocessedItems === undefined,
            );
            yield* Story.assert(
              'the template and its thirty copies all read back the ordinary way',
              work.items.length === 31 && spotCheck?.value.taskId === 't17',
            );
            return {
              unprocessed: batch.UnprocessedItems ?? null,
              total: work.items.length,
              spotCheck,
            };
          }),
        ),
      ),
    }),
    Story.question('What does a batch write skip?', {
      answer:
        'Everything the ordinary write does for you: the shape check, the version stamp, the guards against overwriting, and telling subscribers. You are writing raw rows, so a row with the wrong shape goes in without complaint and fails later, when something reads it.',
      proof: onDynamoDB(
        Story.trace(
          Effect.gen(function* () {
            // Write a raw row whose data is missing most of a task's fields; the batch accepts it.
            yield* DynamoDB.batchInsert(table.logicalName, [
              {
                ...physicalKey('broken'),
                _e: 'Task',
                _v: 'v1',
                _u: '00000000000000000000000099',
                _d: false,
                data: { taskId: 'broken', boardId: 'work', title: 'No status' },
              },
            ]);
            // Read it back the ordinary way; the failure comes back as a value.
            const failure = yield* task
              .get({ taskId: 'broken', boardId: 'work' })
              .pipe(Effect.flip);
            yield* Story.assert(
              'the write went in; the ordinary read is what fails',
              failure._tag === 'DatabaseError',
            );
            return { failure: failure._tag, reason: failure.reason._tag };
          }),
        ),
      ),
    }),
  ],
});
