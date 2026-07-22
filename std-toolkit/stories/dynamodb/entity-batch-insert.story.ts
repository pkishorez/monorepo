import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbEntityStories } from './support/story-groups.js';

import {
  makeDynamoStoryHarness,
  user,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-batch-insert');
type Input = Parameters<typeof harness.users.batchInsert>[0];

const batchInsertUsers = functionBlock(
  'Batch insert users',
  {
    description:
      'Writes one supplied collection through the public entity batch-insert flow.',
    attributes: (input: Input) => ({ items: input.length }),
  },
  (input: Input) => harness.users.batchInsert(input),
);

dynamodbEntityStories
  .story('Batch insert entities', {
    description:
      'Shows how entity batch insertion crosses DynamoDB batch boundaries and reports its result.',
  })
  .provide(harness.layer)
  .execute(batchInsertUsers)
  .scenario(
    'batch insert reports every written item',
    {
      description:
        'Writes thirty entities so the single flow crosses DynamoDB’s batch limit.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(
            Array.from({ length: 30 }, (_, index) => user(`batch-${index}`)),
          ),
        )
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.written.length, 30);
            assert.deepEqual(result.unprocessedIndexes, []);
          }),
        )
        .cleanup(harness.cleanup),
  );
