import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  expectedEntity,
  makeDocumentationHarness,
  normalizeEntity,
  operationDocumentation,
  user,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('entity-delete');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Entity', () => {
    laymosDescribe(
      'Delete',
      {
        description:
          'Delete retains a tombstone by default and requires acknowledgement for physical removal.',
        documentation: operationDocumentation(
          'Use `delete` for normal product deletion.',
          `const deleted = yield* users.delete(key)`,
          'Soft deletion preserves the last value for synchronization. Force deletion is reserved for explicitly acknowledged maintenance.',
        ),
      },
      () => {
        laymosTest(
          'Marks a saved user as deleted while retaining its value.',
          {
            description:
              'A saved user is deleted through the normal product path. The value should remain available for synchronization while being clearly marked as deleted.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('delete-soft');
              yield* harness.clear;
              yield* harness.provide(harness.users.insert(input));

              const deleted = yield* trace(
                harness.provide(
                  harness.users.delete({
                    organizationId: input.organizationId,
                    userId: input.userId,
                  }),
                ),
              );

              expect(
                normalizeEntity(deleted),
                'The deleted user keeps its value and is marked as deleted.',
              ).toEqual(expectedEntity(input, true));
            }),
        );

        laymosTest(
          'Permanently removes a user after explicit acknowledgement.',
          {
            description:
              'A maintenance caller explicitly requests permanent removal. After deletion, the user should no longer exist in the table.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('delete-hard');
              yield* harness.clear;
              yield* harness.provide(harness.users.insert(input));

              yield* trace(
                harness.provide(
                  harness.users.delete(
                    {
                      organizationId: input.organizationId,
                      userId: input.userId,
                    },
                    { forceDelete: 'I know what I am doing' },
                  ),
                ),
              );
              const found = yield* harness.provide(
                harness.users.get({
                  organizationId: input.organizationId,
                  userId: input.userId,
                }),
              );

              expect(
                found,
                'The user can no longer be found after permanent deletion.',
              ).toBeNull();
            }),
        );

        laymosTest(
          'Rejects deletion when the user does not exist.',
          {
            description:
              'No user exists under the requested identity. Deleting it should fail with a clear explanation instead of pretending that work was done.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const failure = yield* trace(
                harness.provide(
                  harness.users
                    .delete({
                      organizationId: 'org-1',
                      userId: 'delete-missing',
                    })
                    .pipe(Effect.flip),
                ),
              );

              expect(
                failure._tag,
                'The deletion reports a DynamoDB failure.',
              ).toBe('DynamodbError');
              expect(
                failure.error._tag,
                'The failure says there is no user to delete.',
              ).toBe('NoItemToDelete');
            }),
        );
      },
    );
  });
});
