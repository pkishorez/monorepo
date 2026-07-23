import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { story } from 'laymos/story';

import { dynamodbStoryDocumentation } from './story-documentation.js';

import {
  makeDynamoStoryHarness,
  order,
  user,
} from './dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-query');
type Input =
  | {
      readonly kind: 'primary';
      readonly sk:
        | { readonly '>=': null }
        | { readonly '<=': null }
        | { readonly beginsWith: string };
      readonly limit?: number;
    }
  | {
      readonly kind: 'secondary';
      readonly status: 'active';
      readonly emailPrefix: string;
    };

const queryOptions = (limit: number | undefined) =>
  limit === undefined ? undefined : { limit };

const seedOrders = Effect.all([
  harness.orders.insert(order('order-2025-12', { userId: 'owner' })),
  harness.orders.insert(order('order-2026-01', { userId: 'owner' })),
  harness.orders.insert(order('order-2026-02', { userId: 'owner' })),
]);

story('Query entities', {
  description:
    'Shows primary and secondary index selection, ordering, sort-key bounds, and result limits.',
  documentation: dynamodbStoryDocumentation.query,
})
  .provide(harness.layer)
  .execute((input: Input): Effect.Effect<any, any, any> => {
    if (input.kind === 'primary') {
      return harness.orders.query(
        'primary',
        {
          pk: { userId: 'owner' },
          sk: input.sk,
        },
        queryOptions(input.limit),
      );
    }
    return harness.users.query('byStatus', {
      pk: { status: input.status },
      sk: { beginsWith: { email: input.emailPrefix } },
    });
  })
  .scenario(
    'forward query returns ascending items',
    { description: 'Uses a null lower bound to read the partition forwards.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>(
            { kind: 'primary', sk: { '>=': null } },
            seedOrders,
          ),
        )
        .verify((result) =>
          Effect.sync(() =>
            assert.deepEqual(
              result.items.map((item: any) => item.value.orderId),
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
          harness.prepare<Input>(
            { kind: 'primary', sk: { '<=': null } },
            seedOrders,
          ),
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
            { kind: 'primary', sk: { beginsWith: 'order-2026' } },
            seedOrders,
          ),
        )
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.items.length, 2);
            assert.ok(
              result.items.every((item: any) =>
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
          harness.prepare<Input>(
            { kind: 'primary', sk: { '>=': null }, limit: 2 },
            seedOrders,
          ),
        )
        .verify((result) =>
          Effect.sync(() => assert.equal(result.items.length, 2)),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'secondary index derives and filters its custom sort key',
    { description: 'Returns active users matching the supplied email prefix.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>(
            { kind: 'secondary', status: 'active', emailPrefix: 'active-' },
            Effect.all([
              harness.users.insert(
                user('a', { email: 'active-a@example.com' }),
              ),
              harness.users.insert(
                user('b', { email: 'active-b@example.com' }),
              ),
              harness.users.insert(
                user('c', {
                  status: 'inactive',
                  email: 'active-c@example.com',
                }),
              ),
            ]),
          ),
        )
        .verify((result) =>
          Effect.sync(() => assert.equal(result.items.length, 2)),
        )
        .cleanup(harness.cleanup),
  );
