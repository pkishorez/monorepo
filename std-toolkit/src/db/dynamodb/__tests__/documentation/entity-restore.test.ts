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

const harness = makeDocumentationHarness('entity-restore');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Entity', () => {
    laymosDescribe(
      'Restore',
      {
        description:
          'Restore makes a retained tombstone live and visible to sync consumers again.',
        documentation: operationDocumentation(
          'Use `restore` to undo a soft deletion.',
          `const restored = yield* users.restore(key)`,
          'A restored tombstone receives a fresh update cursor. Restoring a live entity is a no-op.',
        ),
      },
      () => {
        laymosTest(
          'Restores a deleted user and records it as a new change.',
          {
            description:
              'A saved user was previously marked as deleted. Restoring the user should make it live again and record the restoration as a new change.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('restore-deleted');
              yield* harness.clear;
              const deleted = yield* harness.provide(
                Effect.gen(function* () {
                  yield* harness.users.insert(input);
                  return yield* harness.users.delete({
                    organizationId: input.organizationId,
                    userId: input.userId,
                  });
                }),
              );

              const restored = yield* trace(
                harness.provide(
                  harness.users.restore({
                    organizationId: input.organizationId,
                    userId: input.userId,
                  }),
                ),
              );

              expect(
                normalizeEntity(restored),
                'The restored user is live and keeps its original value.',
              ).toEqual(expectedEntity(input));
              expect(
                restored.meta._u === deleted.meta._u,
                'The restoration has a new change marker.',
              ).toBe(false);
            }),
        );

        laymosTest(
          'Leaves a live user unchanged when restoration is unnecessary.',
          {
            description:
              'The user is already live, so there is nothing to restore. The operation should return the user without recording an unnecessary change.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              const live = yield* harness.provide(
                harness.users.insert(user('restore-live')),
              );

              const restored = yield* trace(
                harness.provide(
                  harness.users.restore({
                    organizationId: live.value.organizationId,
                    userId: live.value.userId,
                  }),
                ),
              );

              expect(
                restored.meta._u,
                'The live user keeps the same change marker because nothing was written.',
              ).toBe(live.meta._u);
            }),
        );

        laymosTest(
          'Rejects restoration when the user does not exist.',
          {
            description:
              'No saved or deleted user exists under the requested identity. Restoration should fail with a clear explanation.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const failure = yield* trace(
                harness.provide(
                  harness.users
                    .restore({
                      organizationId: 'org-1',
                      userId: 'restore-missing',
                    })
                    .pipe(Effect.flip),
                ),
              );

              expect(
                failure._tag,
                'The restoration reports a DynamoDB failure.',
              ).toBe('DynamodbError');
              expect(
                failure.error._tag,
                'The failure says there is no deleted user to restore.',
              ).toBe('NoItemToRestore');
            }),
        );
      },
    );
  });
});
