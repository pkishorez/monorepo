import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbTableStories } from './support/story-groups.js';

import { makeDynamoStoryHarness } from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('table-describe');
const describeTable = functionBlock(
  'Describe the table',
  {
    description:
      'Reads physical metadata through the public table description flow.',
  },
  (_input: {}) => harness.table.describe(),
);

dynamodbTableStories
  .story('Describe a table', {
    description:
      'Shows the physical table and secondary-index metadata returned by DynamoDB.',
  })
  .provide(harness.layer)
  .execute(describeTable)
  .scenario(
    'describe returns the bound table and its index',
    { description: 'Describes the temporary table prepared for this flow.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare({}))
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.tableName, harness.tableName);
            assert.equal(result.indexes[0]?.indexName, 'GSI1');
          }),
        )
        .cleanup(harness.cleanup),
  );
