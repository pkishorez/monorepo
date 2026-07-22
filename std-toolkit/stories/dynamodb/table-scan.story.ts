import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbTableStories } from './support/story-groups.js';

import { makeDynamoStoryHarness } from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('table-scan');
type Input = { readonly limit: number };

const scanRawPages = functionBlock(
  'Scan raw item pages',
  {
    description:
      'Scans consecutive raw table pages until the prepared collection is exhausted.',
  },
  (input: Input) =>
    Effect.gen(function* () {
      const first = yield* harness.table.scan({ Limit: input.limit });
      const second = yield* harness.table.scan(
        first.LastEvaluatedKey
          ? { ExclusiveStartKey: first.LastEvaluatedKey }
          : undefined,
      );
      return { first, second };
    }),
);

const seedItems = Effect.all([
  harness.table.putItem({ pk: 'GROUP', sk: 'ONE' }),
  harness.table.putItem({ pk: 'GROUP', sk: 'TWO' }),
  harness.table.putItem({ pk: 'GROUP', sk: 'THREE' }),
]);

dynamodbTableStories
  .story('Scan items', {
    description:
      'Shows cursor pagination through one coherent raw table scan flow.',
  })
  .provide(harness.layer)
  .execute(scanRawPages)
  .scenario(
    'scan cursor continues onto the next page',
    { description: 'Uses the first continuation key for the next scan.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare({ limit: 2 }, seedItems))
        .verify(({ first, second }) =>
          Effect.sync(() => {
            assert.equal(first.Items.length, 2);
            assert.ok(first.LastEvaluatedKey);
            assert.equal(second.Items.length, 1);
          }),
        )
        .cleanup(harness.cleanup),
  );
