import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import { exprCondition } from '../../index.js';
import {
  expectedSettings,
  makeDocumentationHarness,
  normalizeSingleEntity,
  operationDocumentation,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('single-entity-update');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Single entity', () => {
    laymosDescribe(
      'Update',
      {
        description:
          'Update changes selected fields only after singleton state has been persisted.',
        documentation: operationDocumentation(
          'Use `update` for focused edits to stored singleton state.',
          `const updated = yield* appSettings.update({ update: { retries: 6 } })`,
          'The synthetic default is not updateable. Missing storage and unmet conditions produce typed failures.',
        ),
      },
      () => {
        laymosTest(
          'Changes one setting and preserves every other saved setting.',
          {
            description:
              'Dark mode and the retry count are already saved. Changing only the retry count should leave dark mode untouched.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(
                harness.settings.put({ theme: 'dark', retries: 5 }),
              );

              const updated = yield* trace(
                harness.provide(
                  harness.settings.update({
                    update: { retries: 6 },
                  }),
                ),
              );

              expect(
                normalizeSingleEntity(updated),
                'The retry count changes while the theme stays the same.',
              ).toEqual(expectedSettings('dark', 6));
            }),
        );

        laymosTest(
          'Rejects a partial update before settings have been saved.',
          {
            description:
              'Only configured defaults are available because settings have never been saved. A partial update should fail instead of silently creating storage.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const failure = yield* trace(
                harness.provide(
                  harness.settings
                    .update({ update: { retries: 4 } })
                    .pipe(Effect.flip),
                ),
              );

              expect(
                failure._tag,
                'The update reports a DynamoDB failure.',
              ).toBe('DynamodbError');
              expect(
                failure.error._tag,
                'The failure says that settings must be saved before updating.',
              ).toBe('NoItemToUpdate');
            }),
        );

        laymosTest(
          'Rejects a settings change when the required condition is not true.',
          {
            description:
              'The saved theme does not satisfy the caller’s required theme. The retry count should not change.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(
                harness.settings.put({ theme: 'dark', retries: 5 }),
              );

              const failure = yield* trace(
                harness.provide(
                  harness.settings
                    .update({
                      update: { retries: 6 },
                      condition: exprCondition(($) =>
                        $.cond('theme', '=', 'light'),
                      ),
                    })
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
