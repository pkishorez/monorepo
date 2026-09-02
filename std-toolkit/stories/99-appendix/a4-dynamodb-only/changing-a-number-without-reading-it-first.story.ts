import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { Ulid } from 'std-toolkit/core';
import { DynamoDB, exprCondition } from 'std-toolkit/db/dynamodb';
import { EntityESchema } from 'std-toolkit/eschema';
import { table } from '../../01-one-task-one-table/02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';

// A board's running numbers: how often it was opened, who opened it, and a label. One row per board.
const BoardStats = EntityESchema.make('BoardStats', 'boardId', {
  views: Schema.Number,
  visitors: Schema.Array(Schema.String),
  label: Schema.String,
}).build();

// BoardStats attached to the table, all boards in one group.
const stats = table.entity(BoardStats).primary({ pk: [] }).build();

// A brand-new table on the local DynamoDB (port 8090) for every run, deleted afterwards even if the program fails; stamps count up from one.
let run = 0;
const onDynamoDB = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const dynamodb = DynamoDB.make(table, {
      tableName: `board-native-update-${process.pid}-${++run}`,
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

// The work board's stats, before anyone opens it.
const seed = stats.insert({
  boardId: 'work',
  views: 0,
  visitors: [],
  label: 'Work',
});

export const changingANumberWithoutReadingItFirst = Story.make({
  title: 'Changing a number without reading it first',
  description:
    'A native update sends the arithmetic to DynamoDB instead of reading the row, changing it, and writing it back.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do I add to a counter without reading it first?', {
      answer:
        "With `DynamoDB.update`, which turns `$.set('views', $.opAdd('views', 5))` into an expression DynamoDB applies in place. The ordinary update from chapter 5 reads the row, changes it and writes it back with a guard; only DynamoDB can do the sum itself, so only DynamoDB has this.",
      proof: onDynamoDB(
        Story.trace(
          Effect.gen(function* () {
            // Save the stats at zero.
            const before = yield* seed;
            // Add five, in the database.
            const after = yield* DynamoDB.update(stats, {
              key: { boardId: 'work' },
              update: ($) => [$.set('views', $.opAdd('views', 5))],
            });
            yield* Story.assert(
              'the counter went from 0 to 5 without a read',
              before.value.views === 0 && after.value.views === 5,
            );
            yield* Story.assert(
              'and the update stamp moved on',
              after.meta._u > before.meta._u,
            );
            return { before, after };
          }),
        ),
      ),
    }),
    Story.question('What else can a native update do in one go?', {
      answer:
        'Add to a list, and set a field only if it is not there yet. Every operation you list compiles into the one expression, so they all land together.',
      proof: onDynamoDB(
        Story.trace(
          Effect.gen(function* () {
            // Save the stats.
            yield* seed;
            // Append two visitors and try to set a label that already exists.
            const updated = yield* DynamoDB.update(stats, {
              key: { boardId: 'work' },
              update: ($) => [
                $.append('visitors', ['ana', 'ben']),
                $.set('label', $.opIfNotExists('label', 'ignored')),
              ],
            });
            yield* Story.assert(
              'both visitors were appended',
              updated.value.visitors.join() === 'ana,ben',
            );
            yield* Story.assert(
              'the existing label was left alone',
              updated.value.label === 'Work',
            );
            return { updated };
          }),
        ),
      ),
    }),
    Story.question('Can a native update refuse to apply?', {
      answer:
        'Yes: give it a `condition`, and DynamoDB refuses the write when the condition is false. The failure is `DynamoDBNativeError`, the native one, not the portable failure the ordinary update gives.',
      proof: onDynamoDB(
        Story.trace(
          Effect.gen(function* () {
            // Save the stats.
            yield* seed;
            // Add one, but only if the counter is at 999; the failure comes back as a value.
            const failure = yield* DynamoDB.update(stats, {
              key: { boardId: 'work' },
              update: ($) => [$.set('views', $.opAdd('views', 1))],
              condition: exprCondition(($) => $.cond('views', '=', 999)),
            }).pipe(Effect.flip);
            // Read what the table kept.
            const untouched = yield* stats.get({ boardId: 'work' });
            yield* Story.assert(
              'the refused write is a native failure',
              failure._tag === 'DynamoDBNativeError',
            );
            yield* Story.assert(
              'nothing was written',
              untouched?.value.views === 0,
            );
            return { failure: failure._tag, untouched };
          }),
        ),
      ),
    }),
  ],
});
