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
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do you increment a counter without reading it first?', {
      answer:
        'DynamoDB.update compiles a typed expression — here an ADD on a numeric field — that DynamoDB applies in place. The portable counterpart is getAndUpdate, which must read, modify, and write back guarded on the update stamp; only DynamoDB can push arithmetic into the database itself, so this is a DynamoDB-native operation.',
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
    Story.question('What else can an update expression do?', {
      answer:
        'Append to lists and set a field only when it is absent — APPEND and if_not_exists compile into the same expression, so one round-trip does all of it atomically.',
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
    Story.question('Can an update refuse to apply?', {
      answer:
        'Yes — attach a condition expression and DynamoDB rejects the write atomically when it does not hold, failing with DynamoDBNativeError instead of the portable DatabaseError.',
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
