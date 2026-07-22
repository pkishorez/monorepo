import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbTableStories } from './support/story-groups.js';

import { makeDynamoStoryHarness } from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('table-delete-item');
const key = { pk: 'RAW#one', sk: 'ITEM#one' };

const deleteRawItem = functionBlock(
  'Delete a raw item',
  {
    description:
      'Physically removes one exact key through the public raw table delete flow.',
  },
  (_input: {}) => harness.table.deleteItem(key),
);

dynamodbTableStories
  .story('Delete an item', {
    description: 'Shows the physical deletion of one raw DynamoDB item.',
  })
  .provide(harness.layer)
  .execute(deleteRawItem)
  .scenario(
    'delete physically removes the raw item',
    { description: 'Deletes a prepared item by its exact key.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(
            {},
            harness.table.putItem({ ...key, value: 'stored' }),
          ),
        )
        .verify(() =>
          harness.table
            .getItem(key)
            .pipe(
              Effect.tap((result) =>
                Effect.sync(() => assert.equal(result.Item, null)),
              ),
            ),
        )
        .cleanup(harness.cleanup),
  );
