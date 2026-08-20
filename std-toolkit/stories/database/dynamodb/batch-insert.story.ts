import { Effect } from 'effect';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { Story } from 'laymos/story';

import { onDynamoDB } from '../support.js';
import { counter, counterKey, unmarshallItem } from './support.js';

export const batchInsert = Story.make({
  title: 'Batch insert',
  description:
    'A batch write reduces the number of network calls. Only DynamoDB needs this.',
  setupNote:
    'The `counter` entity from the DynamoDB support file, against DynamoDB Local.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do you fill a table faster than one write at a time?', {
      answer:
        'Use a batch write. It sends raw rows in groups of 25, which is the DynamoDB limit, and reports anything that DynamoDB refused. It exists to reduce network calls. IndexedDB and SQLite run in the same process and have no network calls to reduce, so this operation belongs to DynamoDB only.',
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
    Story.question('What does a batch write leave out?', {
      answer:
        'Everything that the portable write path does for you: the schema check, the version stamp, the conditions, and the change messages. You write raw rows, so a row with the wrong shape reaches the table and fails later, when something reads it.',
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
