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

const harness = makeDocumentationHarness('entity-insert');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Entity', () => {
    laymosDescribe(
      'Insert',
      {
        description:
          'Insert creates a keyed entity without replacing an existing identity.',
        documentation: operationDocumentation(
          'Use `insert` to create a record that must not already exist.',
          `const inserted = yield* users.insert(user)`,
          'The write derives storage keys and metadata from the domain value. Duplicate identities and unmet caller conditions fail without replacing data.',
        ),
      },
      () => {
        laymosTest(
          'Creates a new entity and returns the saved user.',
          {
            description:
              'No user exists with this identity yet. Inserting the user should save the complete value and return what was saved.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('insert-new');
              yield* harness.clear;

              const inserted = yield* trace(
                harness.provide(harness.users.insert(input)),
              );

              expect(
                normalizeEntity(inserted),
                'The saved user matches the submitted user.',
              ).toEqual(expectedEntity(input));
            }),
        );

        laymosTest(
          'Rejects a user whose identity already exists.',
          {
            description:
              'A user with this identity is already saved. A second insert should fail and must not replace the existing user.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(
                harness.users.insert(user('insert-duplicate')),
              );

              const failure = yield* trace(
                harness.provide(
                  harness.users
                    .insert(user('insert-duplicate', { name: 'Replacement' }))
                    .pipe(Effect.flip),
                ),
              );

              expect(
                failure._tag,
                'The insert reports a DynamoDB failure.',
              ).toBe('DynamodbError');
              expect(
                failure.error._tag,
                'The failure says that this user already exists.',
              ).toBe('ItemAlreadyExists');
            }),
        );

        laymosTest(
          'Rejects a new user when the required condition is not true.',
          {
            description:
              'The new user does not satisfy the condition supplied by the caller. DynamoDB should reject the write before any user is saved.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const failure = yield* trace(
                harness.provide(
                  harness.users
                    .insert(user('insert-condition'), {
                      condition: exprCondition(($) =>
                        $.cond('status', '=', 'inactive'),
                      ),
                    })
                    .pipe(Effect.flip),
                ),
              );

              expect(
                failure._tag,
                'The insert reports a DynamoDB failure.',
              ).toBe('DynamodbError');
              expect(
                failure.error._tag,
                'The failure says that the guarded insert was rejected.',
              ).toBe('ItemAlreadyExists');
            }),
        );
      },
    );
  });
});
