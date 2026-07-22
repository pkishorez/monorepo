import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbEntityStories } from './support/story-groups.js';

import {
  makeDynamoStoryHarness,
  order,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-query');
type Input = {
  readonly sk:
    | { readonly '>=': null }
    | { readonly '<=': null }
    | { readonly beginsWith: string };
  readonly limit?: number;
};

const queryOrders = functionBlock(
  'Query orders',
  {
    description:
      'Queries one order partition through the public primary-index entity flow.',
    attributes: (input: Input) => ({ limit: input.limit }),
  },
  (input: Input) =>
    harness.orders.query(
      'primary',
      { pk: { userId: 'owner' }, sk: input.sk },
      input.limit === undefined ? undefined : { limit: input.limit },
    ),
);

const seedOrders = Effect.all([
  harness.orders.insert(order('order-2025-12', { userId: 'owner' })),
  harness.orders.insert(order('order-2026-01', { userId: 'owner' })),
  harness.orders.insert(order('order-2026-02', { userId: 'owner' })),
]);

dynamodbEntityStories
  .story('Query entities', {
    description:
      'Shows ordering, sort-key bounds, and limits for one primary-index entity query flow.',
  })
  .provide(harness.layer)
  .execute(queryOrders)
  .scenario(
    'forward query returns ascending items',
    { description: 'Uses a null lower bound to read the partition forwards.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>({ sk: { '>=': null } }, seedOrders),
        )
        .verify((result) =>
          Effect.sync(() =>
            assert.deepEqual(
              result.items.map((item) => item.value.orderId),
              ['order-2025-12', 'order-2026-01', 'order-2026-02'],
            ),
          ),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'backward query returns descending items',
    { description: 'Uses a null upper bound to read the partition backwards.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>({ sk: { '<=': null } }, seedOrders),
        )
        .verify((result) =>
          Effect.sync(() =>
            assert.equal(result.items[0]?.value.orderId, 'order-2026-02'),
          ),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'prefix query returns matching identities',
    { description: 'Narrows the same query flow by a sort-key prefix.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>(
            { sk: { beginsWith: 'order-2026' } },
            seedOrders,
          ),
        )
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.items.length, 2);
            assert.ok(
              result.items.every((item) =>
                item.value.orderId.startsWith('order-2026'),
              ),
            );
          }),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'limit truncates the returned collection',
    { description: 'Requests fewer results than the partition contains.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>({ sk: { '>=': null }, limit: 2 }, seedOrders),
        )
        .verify((result) =>
          Effect.sync(() => assert.equal(result.items.length, 2)),
        )
        .cleanup(harness.cleanup),
  );
