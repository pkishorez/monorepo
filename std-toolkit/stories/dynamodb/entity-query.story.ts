import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { decision, flow } from 'laymos/story';

import { dynamodbEntityStories } from './support/story-groups.js';

import {
  makeDynamoStoryHarness,
  order,
  user,
} from './support/dynamodb-story-harness.js';

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

const queryOrders = flow<[Input], any, any, any>(
  'Query entities',
  {
    description:
      'Queries entities through either their primary index or a configured secondary index.',
    attributes: (input: Input) => ({
      kind: input.kind,
      limit: 'limit' in input ? input.limit : undefined,
    }),
  },
  (input: Input) =>
    decision(
      'Which query path is requested?',
      {
        description:
          'Routes the Story through primary or secondary entity indexing.',
      },
      () => Effect.succeed(input.kind),
    )
      .when(
        'primary',
        {
          name: 'Use the primary index',
          description: 'Queries entities through their primary partition.',
        },
        () => {
          const primary = input as Extract<Input, { kind: 'primary' }>;
          return harness.orders.query(
            'primary',
            {
              pk: { userId: 'owner' },
              sk: primary.sk,
            },
            primary.limit === undefined ? undefined : { limit: primary.limit },
          );
        },
      )
      .when(
        'secondary',
        {
          name: 'Use a secondary index',
          description: 'Queries entities through a configured secondary index.',
        },
        () => {
          const secondary = input as Extract<Input, { kind: 'secondary' }>;
          return harness.users.query('byStatus', {
            pk: { status: secondary.status },
            sk: { beginsWith: { email: secondary.emailPrefix } },
          });
        },
      )
      .exhaustive(),
);

const seedOrders = Effect.all([
  harness.orders.insert(order('order-2025-12', { userId: 'owner' })),
  harness.orders.insert(order('order-2026-01', { userId: 'owner' })),
  harness.orders.insert(order('order-2026-02', { userId: 'owner' })),
]);

dynamodbEntityStories
  .story('Query entities', {
    description:
      'Shows primary and secondary index selection, ordering, sort-key bounds, and result limits.',
  })
  .provide(harness.layer)
  .execute(queryOrders)
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
