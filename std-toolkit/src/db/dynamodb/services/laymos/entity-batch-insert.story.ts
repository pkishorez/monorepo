import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { story } from 'laymos/story';

import { dynamodbStoryDocumentation } from './story-documentation.js';

import { makeDynamoStoryHarness, user } from './dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-batch-insert');
type Input = Parameters<typeof harness.users.batchInsert>[0];

story('Batch insert entities', {
  description:
    'Shows how entity batch insertion crosses DynamoDB batch boundaries and reports its result.',
  documentation: dynamodbStoryDocumentation.batchInsert,
})
  .provide(harness.layer)
  .execute((input: Input) => harness.users.batchInsert(input))
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
