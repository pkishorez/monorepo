import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbTableStories } from './support/story-groups.js';

import { buildExpr, exprUpdate } from '../../src/db/dynamodb/index.js';
import { makeDynamoStoryHarness } from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('table-update-item');
const key = { pk: 'RAW#one', sk: 'ITEM#one' };
const update = {
  ...buildExpr({
    update: exprUpdate<{ value: string }>(($) => [$.set('value', 'updated')]),
  }),
  ReturnValues: 'ALL_NEW' as const,
};

const updateRawItem = functionBlock(
  'Update a raw item',
  {
    description:
      'Applies one compiled expression through the public raw table update flow.',
  },
  (_input: {}) => harness.table.updateItem(key, update),
);

dynamodbTableStories
  .story('Update an item', {
    description: 'Shows one raw update expression and its returned attributes.',
  })
  .provide(harness.layer)
  .execute(updateRawItem)
  .scenario(
    'update returns the new raw attributes',
    { description: 'Updates a prepared item and requests all new attributes.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(
            {},
            harness.table.putItem({ ...key, value: 'stored' }),
          ),
        )
        .verify((result) =>
          Effect.sync(() => assert.equal(result.Attributes?.value, 'updated')),
        )
        .cleanup(harness.cleanup),
  );
