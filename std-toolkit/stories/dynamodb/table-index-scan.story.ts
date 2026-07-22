import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbTableStories } from './support/story-groups.js';

import { makeDynamoStoryHarness } from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('table-index-scan');

const scanStatusIndex = functionBlock(
  'Scan the status index',
  {
    description:
      'Scans all indexed raw items through the public secondary-index surface.',
  },
  (_input: {}) => harness.table.index('GSI1').scan(),
);

const seedItems = Effect.all([
  harness.table.putItem({
    pk: 'GROUP',
    sk: 'ONE',
    GSI1PK: 'STATUS',
    GSI1SK: 'ONE',
  }),
  harness.table.putItem({
    pk: 'GROUP',
    sk: 'TWO',
    GSI1PK: 'STATUS',
    GSI1SK: 'TWO',
  }),
  harness.table.putItem({
    pk: 'GROUP',
    sk: 'THREE',
    GSI1PK: 'STATUS',
    GSI1SK: 'THREE',
  }),
]);

dynamodbTableStories
  .story('Scan an index', {
    description:
      'Shows one complete scan through a configured DynamoDB secondary index.',
  })
  .provide(harness.layer)
  .execute(scanStatusIndex)
  .scenario(
    'secondary-index scan returns indexed items',
    { description: 'Reads every prepared indexed item.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare({}, seedItems))
        .verify((result) =>
          Effect.sync(() => assert.equal(result.Items.length, 3)),
        )
        .cleanup(harness.cleanup),
  );
