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

const harness = makeDocumentationHarness('entity-get-and-update');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Entity', () => {
    laymosDescribe(
      'Get and update',
      {
        description:
          'Get and update derives a guarded write from the latest stored entity.',
        documentation: operationDocumentation(
          'Use `getAndUpdate` when the next value depends on current state.',
          `const updated = yield* users.getAndUpdate(key, current => ({ score: current.score + 1 }))`,
          'Concurrent conflicts are retried. Returning `null` skips the write and preserves the update cursor.',
        ),
      },
      () => {
        laymosTest(
          'Calculates the next score from the saved user.',
          {
            description:
              'The next score depends on the score currently saved for the user. The operation should read that value, calculate the increase, and save the result.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const current = user('get-update-derive');
              yield* harness.clear;
              yield* harness.provide(harness.users.insert(current));

              const updated = yield* trace(
                harness.provide(
                  harness.users.getAndUpdate(
                    {
                      organizationId: current.organizationId,
                      userId: current.userId,
                    },
                    (stored) => ({ score: stored.score + 5 }),
                  ),
                ),
              );

              expect(
                normalizeEntity(updated),
                'The saved score includes the calculated increase.',
              ).toEqual(
                expectedEntity(user('get-update-derive', { score: 15 })),
              );
            }),
        );

        laymosTest(
          'Leaves the saved user unchanged when no update is requested.',
          {
            description:
              'The caller inspects the saved user and decides that no change is needed. No write should occur and the user’s change marker should stay the same.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              const inserted = yield* harness.provide(
                harness.users.insert(user('get-update-skip')),
              );

              const unchanged = yield* trace(
                harness.provide(
                  harness.users.getAndUpdate(
                    { organizationId: 'org-1', userId: 'get-update-skip' },
                    () => null,
                  ),
                ),
              );

              expect(
                unchanged.meta._u,
                'The user keeps the same change marker because nothing was written.',
              ).toBe(inserted.meta._u);
            }),
        );

        laymosTest(
          'Rejects the change when the user does not exist.',
          {
            description:
              'There is no saved user from which to calculate a change. The operation should fail rather than create a user from incomplete state.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const failure = yield* trace(
                harness.provide(
                  harness.users
                    .getAndUpdate(
                      {
                        organizationId: 'org-1',
                        userId: 'get-update-missing',
                      },
                      () => ({ score: 1 }),
                    )
                    .pipe(Effect.flip),
                ),
              );

              expect(
                failure._tag,
                'The change reports a DynamoDB failure.',
              ).toBe('DynamodbError');
              expect(
                failure.error._tag,
                'The failure says there is no user to update.',
              ).toBe('NoItemToUpdate');
            }),
        );
      },
    );
  });
});
