import { strict as assert } from 'node:assert';

import { Effect, Stream } from 'effect';
import { markdown, story } from 'laymos/story';

import { makeDynamoStoryHarness, order } from './dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-query-stream');
type Input = { readonly batchSize: number };

const seedOrders = Effect.all([
  harness.orders.insert(order('order-1', { userId: 'owner' })),
  harness.orders.insert(order('order-2', { userId: 'owner' })),
  harness.orders.insert(order('order-3', { userId: 'owner' })),
]);

story('Stream entity query', {
  description: 'Shows pagination through one entity stream until exhaustion.',
  documentation: markdown`
      ## Consuming a complete query range

      \`queryStream\` repeatedly requests bounded DynamoDB pages and exposes
      them as an Effect Stream. Backpressure is preserved: the next page is
      requested only as downstream consumption advances.

      \`\`\`ts
      const batches = yield* orders
        .queryStream(
          'primary',
          { pk: { userId: 'owner' }, sk: { '>': null } },
          { batchSize: 25 },
        )
        .pipe(Stream.runCollect);
      \`\`\`

      Use a stream when the caller needs the whole range without owning
      continuation-key bookkeeping.
    `,
})
  .provide(harness.layer)
  .execute((input: Input) =>
    harness.orders
      .queryStream(
        'primary',
        { pk: { userId: 'owner' }, sk: { '>': null } },
        { batchSize: input.batchSize },
      )
      .pipe(Stream.runCollect),
  )
  .scenario(
    'query stream yields every item in bounded batches',
    {
      description: 'Paginates three items with a batch size of two.',
      documentation: markdown`
        Three stored orders and a batch size of two force two DynamoDB pages.
        The scenario verifies complete delivery and the expected \`[2, 1]\`
        page boundary.
      `,
    },
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
