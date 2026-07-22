import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbEntityStories } from './support/story-groups.js';

import {
  assertDynamoError,
  makeDynamoStoryHarness,
  order,
  user,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-transact');
type Input = { readonly items: Parameters<typeof harness.table.transact>[0] };
const key = { organizationId: 'org-1', userId: 'target' };

const transactEntities = functionBlock(
  'Transact entity operations',
  {
    description:
      'Commits one prepared collection of deferred entity operations atomically.',
    attributes: (input: Input) => ({ operations: input.items.length }),
  },
  (input: Input) => harness.table.transact(input.items),
);

const prepareOperations = (
  build: Effect.Effect<Input, any, any>,
  seed: Effect.Effect<unknown, unknown, any> = Effect.void,
) => harness.prepare(undefined, seed).pipe(Effect.andThen(build));

dynamodbEntityStories
  .story('Transact across entities', {
    description:
      'Shows the observable paths of committing one prepared atomic transaction.',
  })
  .provide(harness.layer)
  .execute(transactEntities)
  .scenario(
    'empty transaction succeeds as a no-op',
    { description: 'Commits an empty operation collection.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare({ items: [] }))
        .verify((result) => Effect.sync(() => assert.deepEqual(result, [])))
        .cleanup(harness.cleanup),
  )
  .scenario(
    'transaction inserts different entity types atomically',
    {
      description:
        'Prepares user and order inserts, then commits them together.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          prepareOperations(
            Effect.gen(function* () {
              const userOp = yield* harness.users.insertOp(user('new-user'));
              const orderOp = yield* harness.orders.insertOp(
                order('new-order'),
              );
              return { items: [userOp, orderOp] };
            }),
          ),
        )
        .verify((result) => Effect.sync(() => assert.equal(result.length, 2)))
        .cleanup(harness.cleanup),
  )
  .scenario(
    'transaction mixes an update with an insert',
    {
      description: 'Prepares two operation kinds and commits one transaction.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          prepareOperations(
            Effect.gen(function* () {
              const updateOp = yield* harness.users.updateOp(key, {
                update: { name: 'Committed' },
              });
              const insertOp = yield* harness.orders.insertOp(order('created'));
              return { items: [updateOp, insertOp] };
            }),
            harness.users.insert(user('target')),
          ),
        )
        .verify(() =>
          harness.users
            .get(key)
            .pipe(
              Effect.tap((stored) =>
                Effect.sync(() =>
                  assert.equal(stored?.value.name, 'Committed'),
                ),
              ),
            ),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'stale operation fails and rolls back every write',
    {
      description: 'Invalidates a prepared optimistic operation before commit.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          prepareOperations(
            Effect.gen(function* () {
              const staleOp = yield* harness.users.updateOp(key, {
                update: { name: 'Stale' },
              });
              yield* harness.users.update(key, {
                update: { name: 'Concurrent' },
              });
              const insertOp = yield* harness.orders.insertOp(
                order('rolled-back'),
              );
              return { items: [staleOp, insertOp] };
            }),
            harness.users.insert(user('target')),
          ),
        )
        .verifyError((error) =>
          assertDynamoError(error, 'ConditionFailed').pipe(
            Effect.andThen(
              harness.orders.get({ userId: 'user-1', orderId: 'rolled-back' }),
            ),
            Effect.tap((stored) =>
              Effect.sync(() => assert.equal(stored, null)),
            ),
          ),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'last-write-wins commits after a concurrent write',
    {
      description:
        'Commits a prepared operation whose cursor guard was explicitly disabled.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          prepareOperations(
            Effect.gen(function* () {
              const op = yield* harness.users.updateOp(key, {
                update: { name: 'From operation' },
                lastWriteWins: true,
              });
              yield* harness.users.update(key, {
                update: { name: 'Concurrent' },
              });
              return { items: [op] };
            }),
            harness.users.insert(user('target')),
          ),
        )
        .verify(() =>
          harness.users
            .get(key)
            .pipe(
              Effect.tap((stored) =>
                Effect.sync(() =>
                  assert.equal(stored?.value.name, 'From operation'),
                ),
              ),
            ),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'delete operation commits a tombstone',
    { description: 'Commits one prepared deferred soft-delete operation.' },
    (scenario) =>
      scenario
        .prepare(() =>
          prepareOperations(
            Effect.gen(function* () {
              const deleteOp = yield* harness.users.deleteOp(key);
              return { items: [deleteOp] };
            }),
            harness.users.insert(user('target')),
          ),
        )
        .verify(() =>
          harness.users
            .get(key)
            .pipe(
              Effect.tap((stored) =>
                Effect.sync(() => assert.equal(stored?.meta._d, true)),
              ),
            ),
        )
        .cleanup(harness.cleanup),
  );
