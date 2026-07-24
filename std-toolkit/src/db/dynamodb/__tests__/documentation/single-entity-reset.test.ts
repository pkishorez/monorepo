import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  expectedSettings,
  makeDocumentationHarness,
  normalizeSingleEntity,
  operationDocumentation,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('single-entity-reset');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Single entity', () => {
    laymosDescribe(
      'Reset',
      {
        description: 'Reset persists the configured singleton default.',
        documentation: operationDocumentation(
          'Use `reset` to write the configured default as real database state.',
          `const reset = yield* appSettings.reset()`,
          'Reset is a write with a fresh cursor; it does not delete the singleton item.',
        ),
      },
      () => {
        laymosTest(
          'Replaces saved settings with the configured defaults.',
          {
            description:
              'Custom settings are currently saved. Resetting them should write the configured defaults as the new saved value.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(
                harness.settings.put({ theme: 'dark', retries: 8 }),
              );

              const reset = yield* trace(
                harness.provide(harness.settings.reset()),
              );

              expect(
                normalizeSingleEntity(reset),
                'The saved settings now match the configured defaults.',
              ).toEqual(expectedSettings('light', 3));
            }),
        );
      },
    );
  });
});
