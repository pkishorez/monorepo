import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { Ulid } from 'std-toolkit/core';
import {
  DynamoDB,
  dynamoTableService,
  unmarshall,
} from 'std-toolkit/db/dynamodb';
import { table } from '../../01-one-task-one-table/02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { task } from '../../01-one-task-one-table/03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';

// A brand-new table on the local DynamoDB (port 8090) for every run, deleted afterwards even if the program fails; stamps count up from one.
let run = 0;
const onDynamoDB = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const dynamodb = DynamoDB.make(table, {
      tableName: `board-fully-native-${process.pid}-${++run}`,
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

// Three tasks on the work board.
const seed = Effect.forEach(['t1', 't2', 't3'], (taskId) =>
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

export const goingFullyNative = Story.make({
  title: 'Going fully native',
  description:
    'Below the native operations sits the raw client and the physical table name. With them the whole DynamoDB API is open, and portability is gone.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'How do I do something the native operations do not offer?',
      {
        answer:
          'Ask the layer for `dynamoTableService(table.logicalName)`: it holds the typed client and the physical table name, and with those the whole DynamoDB API is yours. Here that is a scan of every row, which the portable table does not offer.',
        proof: onDynamoDB(
          Story.trace(
            Effect.gen(function* () {
              // Save three tasks the ordinary way.
              yield* seed;
              // The raw client and the real table name, from the same layer the tasks were written through.
              const service = yield* dynamoTableService(table.logicalName);
              // Scan the whole physical table.
              const scanned = yield* service.client.scan({
                TableName: service.tableName,
              });
              // The entity name each raw row carries.
              const entities = (scanned.Items ?? []).map(
                (item) =>
                  unmarshall(item as Parameters<typeof unmarshall>[0])._e,
              );
              yield* Story.assert(
                'the scan sees every row the ordinary writes made',
                scanned.Count === 3,
              );
              yield* Story.assert(
                'and each row is stamped as a Task',
                entities.every((entity) => entity === 'Task'),
              );
              return {
                count: scanned.Count,
                entities,
                tableName: service.tableName,
              };
            }),
          ),
        ),
      },
    ),
    Story.question('How many levels are there, then?', {
      answer:
        'Three: the portable table, which runs on every database; the native operations (`DynamoDB.update`, `getItem`, `batchInsert`), which keep your entities but need DynamoDB; and the raw client, which speaks the wire protocol. Each step down gives up portability, and one program can use the top and the bottom together.',
      proof: onDynamoDB(
        Story.trace(
          Effect.gen(function* () {
            // The top level: an ordinary save.
            const [portable] = yield* seed;
            // The bottom level: ask DynamoDB about the table itself.
            const service = yield* dynamoTableService(table.logicalName);
            const described = yield* service.client.describeTable({
              TableName: service.tableName,
            });
            yield* Story.assert(
              'one program used the top and the bottom level together',
              portable?.value.taskId === 't1' &&
                described.Table?.TableStatus === 'ACTIVE',
            );
            return {
              portable: portable?.value.taskId,
              status: described.Table?.TableStatus,
            };
          }),
        ),
      ),
    }),
  ],
});
