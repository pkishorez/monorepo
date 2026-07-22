import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { flow, terminal } from 'laymos/story';

import { dynamodbEntityStories } from './support/story-groups.js';

import {
  makeDynamoStoryHarness,
  user,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-batch-insert');
type Input = Parameters<typeof harness.users.batchInsert>[0];

const batchInsertUsers = flow(
  'Batch insert entities',
  {
    description:
      'Prepares and writes a collection through the public entity batch-insert method.',
    attributes: (input: Input) => ({ items: input.length }),
  },
  (input: Input) =>
    Effect.gen(function* () {
      const result = yield* harness.users.batchInsert(input);
      return yield* terminal(
        'Return the batch result',
        {
          description:
            'Completes this batch-insert flow with its write report.',
          completion: { kind: 'success' },
        },
        Effect.succeed(result),
      );
    }),
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
