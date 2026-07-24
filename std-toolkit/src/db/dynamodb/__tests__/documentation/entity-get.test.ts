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

const harness = makeDocumentationHarness('entity-get');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Entity', () => {
    laymosDescribe(
      'Get',
      {
        description:
          'Get resolves one domain identity, including retained deletion tombstones.',
        documentation: operationDocumentation(
          'Use `get` when the entity identity is known.',
          `const found = yield* users.get({ organizationId, userId })`,
          'Missing identities return `null`. Soft-deleted identities remain readable for synchronization and recovery.',
        ),
      },
      () => {
        laymosTest(
          'Returns the saved user when the identity exists.',
          {
            description:
              'A user has already been saved under the requested identity. Reading that identity should return the same user in the application-facing shape.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('get-existing');
              yield* harness.clear;
              yield* harness.provide(harness.users.insert(input));

              const found = yield* trace(
                harness.provide(
                  harness.users.get({
                    organizationId: input.organizationId,
                    userId: input.userId,
                  }),
                ),
              );

              expect(
                normalizeEntity(found),
                'The returned user matches the saved user.',
              ).toEqual(expectedEntity(input));
            }),
        );

        laymosTest(
          'Returns no user when the identity has never been saved.',
          {
            description:
              'Nothing has ever been saved under the requested identity. Reading it should return no user rather than failing.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const found = yield* trace(
                harness.provide(
                  harness.users.get({
                    organizationId: 'org-1',
                    userId: 'get-missing',
                  }),
                ),
              );

              expect(
                found,
                'No user is returned for the missing identity.',
              ).toBeNull();
            }),
        );

        laymosTest(
          'Returns a deleted user as a retained tombstone.',
          {
            description:
              'The user was deleted without being permanently removed. Reading the identity should return the retained user and clearly mark it as deleted.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('get-deleted');
              yield* harness.clear;
              yield* harness.provide(
                Effect.gen(function* () {
                  yield* harness.users.insert(input);
                  yield* harness.users.delete({
                    organizationId: input.organizationId,
                    userId: input.userId,
                  });
                }),
              );

              const found = yield* trace(
                harness.provide(
                  harness.users.get({
                    organizationId: input.organizationId,
                    userId: input.userId,
                  }),
                ),
              );

              expect(
                normalizeEntity(found),
                'The returned user is marked as deleted but keeps its value.',
              ).toEqual(expectedEntity(input, true));
            }),
        );
      },
    );
  });
});
