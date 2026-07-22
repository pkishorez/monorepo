import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbTableStories } from './support/story-groups.js';

import { makeDynamoStoryHarness } from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('table-get-item');
const key = { pk: 'RAW#one', sk: 'ITEM#one' };
type Input = { readonly consistent: boolean };

const getRawItem = functionBlock(
  'Get a raw item',
  { description: 'Reads one exact key through the public raw table get flow.' },
  (input: Input) =>
    harness.table.getItem(key, { ConsistentRead: input.consistent }),
);

dynamodbTableStories
  .story('Get an item', {
    description: 'Shows present and missing outcomes for one raw table read.',
  })
  .provide(harness.layer)
  .execute(getRawItem)
  .scenario(
    'get returns a stored raw item',
    { description: 'Reads a prepared item consistently.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(
            { consistent: true },
            harness.table.putItem({ ...key, value: 'stored' }),
          ),
        )
        .verify((result) =>
          Effect.sync(() => assert.equal(result.Item?.value, 'stored')),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'get returns null for a missing raw item',
    { description: 'Reads a key that has never been written.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare({ consistent: false }))
        .verify((result) => Effect.sync(() => assert.equal(result.Item, null)))
        .cleanup(harness.cleanup),
  );
