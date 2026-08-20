import { Effect } from 'effect';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { Story } from 'laymos/story';

import { onDynamoDB } from '../support.js';
import { counter, counterKey, unmarshallItem } from './support.js';

export const consistentReads = Story.make({
  title: 'Consistent reads',
  description:
    'Force a read to come from the leader replica instead of one that lags.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do you ask for a read that is certain to be current?', {
      answer:
        'Use the native read and ask for a consistent read. DynamoDB then answers from the leader replica rather than from one that can lag. Its data is on several replicas, so this control exists here. IndexedDB and SQLite always read the state that was last committed.',
      proof: Effect.gen(function* () {
        const result = yield* onDynamoDB(
          Effect.gen(function* () {
            yield* counter.insert({
              counterId: 'c1',
              views: 7,
              tags: [],
              label: 'Leader',
            });
            const output = yield* DynamoDB.getItem(
              'std-table-stories',
              counterKey('c1'),
              { consistentRead: true },
            );
            const row = unmarshallItem(output.Item);
            return {
              found: output.Item !== undefined,
              views: (row.data as { views: number }).views,
            };
          }),
        );
        yield* Story.assert(
          'the freshly written row is guaranteed visible',
          result.found && result.views === 7,
        );
        return result;
      }),
    }),
    Story.question('What shape does a native read return?', {
      answer:
        'The physical DynamoDB row: the key attributes, the metadata columns, and the value under `data`. It is still in the DynamoDB wire form until you convert it. No schema decoding happens, and that is the price of using the native read.',
      proof: Effect.gen(function* () {
        const result = yield* onDynamoDB(
          Effect.gen(function* () {
            yield* counter.insert({
              counterId: 'c2',
              views: 1,
              tags: [],
              label: 'Raw',
            });
            const output = yield* DynamoDB.getItem(
              'std-table-stories',
              counterKey('c2'),
              { consistentRead: true },
            );
            const raw = output.Item ?? {};
            const row = unmarshallItem(raw);
            return {
              wireForm: Object.keys(raw.pk ?? {}),
              columns: Object.keys(row).sort(),
            };
          }),
        );
        yield* Story.assert(
          'the wire form is AttributeValue-typed (pk arrives as { S: ... })',
          JSON.stringify(result.wireForm) === JSON.stringify(['S']),
        );
        yield* Story.assert(
          'the physical row carries keys, meta columns, and data side by side',
          ['_d', '_e', '_u', '_v', 'data', 'pk', 'sk'].every((column) =>
            result.columns.includes(column),
          ),
        );
        return result;
      }),
    }),
  ],
});
