import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import { exprCondition } from '../../index.js';
import {
  expectedEntity,
  makeDocumentationHarness,
  normalizeEntity,
  operationDocumentation,
  user,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('entity-update');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Entity', () => {
    laymosDescribe(
      'Update',
      {
        description:
          'Update changes selected fields on an existing keyed entity.',
        documentation: operationDocumentation(
          'Use `update` for a partial change that must target existing state.',
          `const updated = yield* users.update(key, { update: { score: 11 } })`,
          'Unmentioned fields are preserved. Missing identities and unmet conditions produce typed failures.',
        ),
      },
      () => {
        laymosTest(
          'Changes the requested fields and preserves the rest of the user.',
          {
            description:
              'A user is already saved and only the name and score need to change. The update should preserve every field the caller did not mention.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const current = user('update-success');
              yield* harness.clear;
              yield* harness.provide(harness.users.insert(current));

              const updated = yield* trace(
                harness.provide(
                  harness.users.update(
                    {
                      organizationId: current.organizationId,
                      userId: current.userId,
                    },
                    { update: { name: 'Updated user', score: 11 } },
                  ),
                ),
              );

              expect(
                normalizeEntity(updated),
                'The returned user contains the changes and all untouched fields.',
              ).toEqual(
                expectedEntity(
                  user('update-success', { name: 'Updated user', score: 11 }),
                ),
              );
            }),
        );

        laymosTest(
          'Rejects an update when the user does not exist.',
          {
            description:
              'No user exists under the requested identity. Updating it should fail instead of quietly creating a new user.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const failure = yield* trace(
                harness.provide(
                  harness.users
                    .update(
                      { organizationId: 'org-1', userId: 'update-missing' },
                      { update: { name: 'Never written' } },
                    )
                    .pipe(Effect.flip),
                ),
              );

              expect(
                failure._tag,
                'The update reports a DynamoDB failure.',
              ).toBe('DynamodbError');
              expect(
                failure.error._tag,
                'The failure says there is no user to update.',
              ).toBe('NoItemToUpdate');
            }),
        );

        laymosTest(
          'Rejects an update when the required condition is not true.',
          {
            description:
              'The saved user does not satisfy the caller’s required status. The change should be rejected without modifying the user.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const current = user('update-condition');
              yield* harness.clear;
              yield* harness.provide(harness.users.insert(current));

              const failure = yield* trace(
                harness.provide(
                  harness.users
                    .update(
                      {
                        organizationId: current.organizationId,
                        userId: current.userId,
                      },
                      {
                        update: { name: 'Blocked' },
                        condition: exprCondition(($) =>
                          $.cond('status', '=', 'inactive'),
                        ),
                      },
                    )
                    .pipe(Effect.flip),
                ),
              );

              expect(
                failure._tag,
                'The update reports a DynamoDB failure.',
              ).toBe('DynamodbError');
              expect(
                failure.error._tag,
                'The failure says that the required condition was not met.',
              ).toBe('ConditionCheckFailed');
            }),
        );
      },
    );
  });
});
