import { Effect } from 'effect';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { Story } from 'laymos/story';

import { onDynamoDB } from '../support.js';
import { counter, counterKey, unmarshallItem } from './support.js';

export const batchInsert = Story.make({
  title: 'Batch insert',
  description:
    'Amortizing network round-trips with BatchWriteItem — a DynamoDB-only concern.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do you seed a table faster than one write at a time?', {
      answer:
        'DynamoDB.batchInsert writes raw physical rows through BatchWriteItem, auto-chunked at the native 25-write limit, and reports anything DynamoDB refused as UnprocessedItems. It exists to amortize network round-trips — IndexedDB and SQLite sit in-process with nothing to amortize, so this stays a DynamoDB-native operation.',
      proof: Effect.gen(function* () {
        const result = yield* onDynamoDB(
          Effect.gen(function* () {
            yield* counter.insert({
              counterId: 'c0',
              views: 0,
              tags: [],
              label: 'Template',
            });
            const fetched = yield* DynamoDB.getItem(
              'std-table-stories',
              counterKey('c0'),
            );
            const template = unmarshallItem(fetched.Item);
            const rows = Array.from({ length: 30 }, (_, index) => {
              const counterId = `c${String(index + 1).padStart(2, '0')}`;
              return {
                ...template,
                sk: counterKey(counterId).sk,
                data: {
                  ...(template.data as Record<string, unknown>),
                  counterId,
                },
              };
            });
            const batch = yield* DynamoDB.batchInsert(
              'std-table-stories',
              rows,
            );
            const page = yield* counter.query('primary', {
              pk: {},
              '>=': null,
            });
            const spotCheck = yield* counter.get({ counterId: 'c17' });
            return {
              unprocessed: batch.UnprocessedItems ?? null,
              total: page.items.length,
              spotCheck: spotCheck?.value.counterId ?? null,
            };
          }),
        );
        yield* Story.assert(
          'no writes were left unprocessed',
          result.unprocessed === null,
        );
        yield* Story.assert(
          'all 30 clones plus the template are visible portably',
          result.total === 31,
        );
        yield* Story.assert(
          'a batch-written row reads back through the entity surface',
          result.spotCheck === 'c17',
        );
        return result;
      }),
    }),
    Story.question('What does batchInsert skip on the way in?', {
      answer:
        'Everything the portable write path does for you: eschema validation, version stamping, conditional guards, and change broadcasts. You are writing physical rows — a malformed one lands in the table and only fails later, when a portable read tries to decode it.',
      proof: Effect.gen(function* () {
        const result = yield* onDynamoDB(
          Effect.gen(function* () {
            yield* DynamoDB.batchInsert('std-table-stories', [
              {
                ...counterKey('broken'),
                _e: 'Counter',
                _v: 'v1',
                _u: '00000000000000000000000099',
                _d: false,
                data: { counterId: 'broken', label: 'no views field' },
              },
            ]);
            const error = yield* counter
              .get({ counterId: 'broken' })
              .pipe(Effect.flip);
            return { errorTag: (error as { _tag: string })._tag };
          }),
        );
        yield* Story.assert(
          'the write itself succeeded; the portable read is what rejects it',
          result.errorTag === 'DatabaseError',
        );
        return result;
      }),
    }),
  ],
});
