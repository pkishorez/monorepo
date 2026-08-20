import { Effect } from 'effect';
import { DynamoDB, exprCondition } from 'std-toolkit/db/dynamodb';
import { Story } from 'laymos/story';

import { onDynamoDB } from '../support.js';
import { counter } from './support.js';

const seed = counter.insert({
  counterId: 'c1',
  views: 0,
  tags: [],
  label: 'Launch',
});

export const nativeUpdates = Story.make({
  title: 'Native updates',
  description:
    'Push arithmetic into the database instead of reading, changing, and writing back.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How is a counter increased without a read first?', {
      answer:
        'Use a native update. It builds an expression that DynamoDB applies in the database. The portable operation must read the row, change it, and write it back with a guard. Only DynamoDB can do the arithmetic itself.',
      proof: Effect.gen(function* () {
        const result = yield* onDynamoDB(
          Effect.gen(function* () {
            const inserted = yield* seed;
            const updated = yield* DynamoDB.update(counter, {
              key: { counterId: 'c1' },
              update: ($) => [$.set('views', $.opAdd('views', 5))],
            });
            return {
              before: inserted.value.views,
              after: updated.value.views,
              stampAdvanced: updated.meta._u > inserted.meta._u,
            };
          }),
        );
        yield* Story.assert(
          'the counter moved from 0 to 5 without a read-modify-write',
          result.before === 0 && result.after === 5,
        );
        yield* Story.assert('the update stamp advanced', result.stampAdvanced);
        return result;
      }),
    }),
    Story.question('What else can a native update do?', {
      answer:
        'It can add to a list, and it can set a field only when the field is absent. Both compile into the same expression, so one call does all of it together.',
      proof: Effect.gen(function* () {
        const result = yield* onDynamoDB(
          Effect.gen(function* () {
            yield* seed;
            const updated = yield* DynamoDB.update(counter, {
              key: { counterId: 'c1' },
              update: ($) => [
                $.append('tags', ['first', 'second']),
                $.set('label', $.opIfNotExists('label', 'ignored')),
              ],
            });
            return { tags: updated.value.tags, label: updated.value.label };
          }),
        );
        yield* Story.assert(
          'both values appended to the list',
          JSON.stringify(result.tags) === JSON.stringify(['first', 'second']),
        );
        yield* Story.assert(
          'if_not_exists left the existing label untouched',
          result.label === 'Launch',
        );
        return result;
      }),
    }),
    Story.question('Can a native update refuse to apply?', {
      answer:
        'Yes. Attach a condition. DynamoDB refuses the write when the condition is false, and it reports a DynamoDB error rather than the portable one.',
      proof: Effect.gen(function* () {
        const result = yield* onDynamoDB(
          Effect.gen(function* () {
            yield* seed;
            const error = yield* DynamoDB.update(counter, {
              key: { counterId: 'c1' },
              update: ($) => [$.set('views', $.opAdd('views', 1))],
              condition: exprCondition(($) => $.cond('views', '=', 999)),
            }).pipe(Effect.flip);
            const untouched = yield* counter.get({ counterId: 'c1' });
            return {
              errorTag: (error as { _tag: string })._tag,
              views: untouched?.value.views ?? -1,
            };
          }),
        );
        yield* Story.assert(
          'the failed condition surfaces as DynamoDBNativeError',
          result.errorTag === 'DynamoDBNativeError',
        );
        yield* Story.assert('nothing was written', result.views === 0);
        return result;
      }),
    }),
  ],
});
