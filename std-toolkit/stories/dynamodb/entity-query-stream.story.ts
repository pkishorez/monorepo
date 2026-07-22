import { strict as assert } from 'node:assert';

import { Effect, Stream } from 'effect';
import { flow, step, terminal } from 'laymos/story';

import { dynamodbEntityStories } from './support/story-groups.js';

import {
  makeDynamoStoryHarness,
  order,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-query-stream');
type Input = { readonly batchSize: number };

const streamOrders = flow(
  'Stream entity query',
  {
    description:
      'Consumes every page produced by the public entity query-stream method.',
    attributes: (input: Input) => ({ batchSize: input.batchSize }),
  },
  (input: Input) =>
    Effect.gen(function* () {
      const result = yield* step(
        'Collect streamed entities',
        {
          description:
            'Consumes the third-party Stream runtime until entity pagination completes.',
        },
        () =>
          harness.orders
            .queryStream(
              'primary',
              { pk: { userId: 'owner' }, sk: { '>': null } },
              { batchSize: input.batchSize },
            )
            .pipe(Stream.runCollect),
      );
      return yield* terminal(
        'Return all streamed pages',
        {
          description:
            'Completes this stream flow after every page is collected.',
          completion: { kind: 'success' },
        },
        Effect.succeed(result),
      );
    }),
);

const seedOrders = Effect.all([
  harness.orders.insert(order('order-1', { userId: 'owner' })),
  harness.orders.insert(order('order-2', { userId: 'owner' })),
  harness.orders.insert(order('order-3', { userId: 'owner' })),
]);

dynamodbEntityStories
  .story('Stream entity query', {
    description: 'Shows pagination through one entity stream until exhaustion.',
  })
  .provide(harness.layer)
  .execute(streamOrders)
  .scenario(
    'query stream yields every item in bounded batches',
    { description: 'Paginates three items with a batch size of two.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare({ batchSize: 2 }, seedOrders))
        .verify((batches) =>
          Effect.sync(() => {
            assert.equal(batches.length, 2);
            assert.deepEqual(
              batches.map((batch) => batch.length),
              [2, 1],
            );
          }),
        )
        .cleanup(harness.cleanup),
  );
