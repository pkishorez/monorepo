import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  expectedTransactionEntity,
  makeDocumentationHarness,
  normalizeTransactionEntities,
  operationDocumentation,
  order,
  user,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('table-transact');
const foreignHarness = makeDocumentationHarness('table-transact-foreign');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Table', () => {
    laymosDescribe(
      'Transact',
      {
        description:
          'Transact commits related entity operations as one all-or-nothing write.',
        documentation: operationDocumentation(
          'Use `transact` when several entity changes must remain consistent.',
          `const committed = yield* table.transact([createUser, createOrder])`,
          'Every operation must belong to the same table and target a unique item. Failed conditions roll back the complete transaction.',
        ),
      },
      () => {
        laymosTest(
          'Completes safely when there is nothing to commit.',
          {
            description:
              'The caller has no changes to submit. The transaction should complete without writing or reporting any records.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const committed = yield* trace(
                harness.provide(harness.table.transact([])),
              );

              expect(
                committed,
                'No records are reported as committed.',
              ).toEqual([]);
            }),
        );

        laymosTest(
          'Creates a user and the user’s first order together.',
          {
            description:
              'A new user and the user’s first order must appear together. The transaction should commit both records and report them in the submitted order.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              const [createUser, createOrder] = yield* harness.provide(
                Effect.all([
                  harness.users.insertOp(user('transaction-user')),
                  harness.orders.insertOp(
                    order('transaction-order', {
                      userId: 'transaction-user',
                    }),
                  ),
                ]),
              );

              const committed = yield* trace(
                harness.provide(
                  harness.table.transact([createUser, createOrder]),
                ),
              );

              expect(
                normalizeTransactionEntities(committed),
                'The user and order are both reported as committed.',
              ).toEqual([
                expectedTransactionEntity(
                  'DocumentedUser',
                  user('transaction-user'),
                ),
                expectedTransactionEntity(
                  'DocumentedOrder',
                  order('transaction-order', {
                    userId: 'transaction-user',
                  }),
                ),
              ]);
            }),
        );

        laymosTest(
          'Updates one user and deletes another user together.',
          {
            description:
              'One user’s score changes while another user is deleted. Both changes should become visible together.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              const [update, remove] = yield* harness.provide(
                Effect.gen(function* () {
                  yield* harness.users.batchInsert([
                    user('transaction-update'),
                    user('transaction-delete'),
                  ]);
                  const update = yield* harness.users.updateOp(
                    {
                      organizationId: 'org-1',
                      userId: 'transaction-update',
                    },
                    { update: { score: 20 } },
                  );
                  const remove = yield* harness.users.deleteOp({
                    organizationId: 'org-1',
                    userId: 'transaction-delete',
                  });
                  return [update, remove] as const;
                }),
              );

              const committed = yield* trace(
                harness.provide(harness.table.transact([update, remove])),
              );

              expect(
                normalizeTransactionEntities(committed),
                'The score change and deletion are both reported as committed.',
              ).toEqual([
                expectedTransactionEntity(
                  'DocumentedUser',
                  user('transaction-update', { score: 20 }),
                ),
                expectedTransactionEntity(
                  'DocumentedUser',
                  user('transaction-delete'),
                  true,
                ),
              ]);
            }),
        );

        laymosTest(
          'Leaves every record unchanged when one operation cannot be committed.',
          {
            description:
              'The transaction tries to create one new user and one duplicate user. Because the duplicate cannot be committed, the new user must not be created either.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              const [first, duplicate] = yield* harness.provide(
                Effect.gen(function* () {
                  yield* harness.users.insert(user('transaction-existing'));
                  const first = yield* harness.users.insertOp(
                    user('transaction-rolled-back'),
                  );
                  const duplicate = yield* harness.users.insertOp(
                    user('transaction-existing'),
                  );
                  return [first, duplicate] as const;
                }),
              );

              const failure = yield* trace(
                harness.provide(
                  harness.table.transact([first, duplicate]).pipe(Effect.flip),
                ),
              );
              const rolledBack = yield* harness.provide(
                harness.users.get({
                  organizationId: 'org-1',
                  userId: 'transaction-rolled-back',
                }),
              );

              expect(
                failure._tag,
                'The transaction reports a DynamoDB failure.',
              ).toBe('DynamodbError');
              expect(
                failure.error._tag,
                'The failure says that one operation could not meet its condition.',
              ).toBe('ConditionFailed');
              expect(
                rolledBack,
                'The user from the earlier operation was not partially created.',
              ).toBeNull();
            }),
        );

        laymosTest(
          'Rejects a transaction that changes the same user twice.',
          {
            description:
              'The transaction tries to update and delete the same user. It should reject the ambiguous request before writing anything.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              const [update, remove] = yield* harness.provide(
                Effect.gen(function* () {
                  yield* harness.users.insert(user('transaction-same-key'));
                  const update = yield* harness.users.updateOp(
                    {
                      organizationId: 'org-1',
                      userId: 'transaction-same-key',
                    },
                    { update: { score: 11 } },
                  );
                  const remove = yield* harness.users.deleteOp({
                    organizationId: 'org-1',
                    userId: 'transaction-same-key',
                  });
                  return [update, remove] as const;
                }),
              );

              const failure = yield* trace(
                harness.provide(
                  harness.table.transact([update, remove]).pipe(Effect.flip),
                ),
              );

              expect(
                failure._tag,
                'The transaction reports a DynamoDB failure.',
              ).toBe('DynamodbError');
              expect(
                failure.error._tag,
                'The failure says that the same user was targeted more than once.',
              ).toBe('DuplicateTransactionTarget');
            }),
        );

        laymosTest(
          'Rejects an operation that belongs to a different table.',
          {
            description:
              'An operation was prepared by a different table definition. This table should reject it instead of committing work it does not own.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              const foreign = yield* harness.provide(
                foreignHarness.users.insertOp(user('transaction-foreign')),
              );

              const failure = yield* trace(
                harness.provide(
                  harness.table.transact([foreign]).pipe(Effect.flip),
                ),
              );

              expect(
                failure._tag,
                'The transaction reports a DynamoDB failure.',
              ).toBe('DynamodbError');
              expect(
                failure.error._tag,
                'The failure says that the operation belongs to another table.',
              ).toBe('ForeignTransactionItem');
            }),
        );
      },
    );
  });
});
