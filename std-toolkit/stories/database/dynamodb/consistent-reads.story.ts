import { Effect } from 'effect';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { Story } from 'laymos/story';

import { onDynamoDB } from '../support.js';
import { counter, counterKey, unmarshallItem } from './support.js';

export const consistentReads = Story.make({
  title: 'Consistent reads',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do you demand a strongly consistent read?', {
      answer:
        'DynamoDB.getItem takes the physical key plus consistentRead: true, forcing DynamoDB to answer from the leader replica instead of an eventually consistent one. Read consistency is a DynamoDB-shaped concern — its data lives on distributed replicas that can lag, while IndexedDB and SQLite always read the latest committed state — so the knob exists only here.',
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
        'The physical DynamoDB item: key attributes, the meta columns, and the entity value under data — still in AttributeValue form until unmarshall converts it. No eschema decoding happens; that is the price of stepping outside the StdTable surface.',
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
