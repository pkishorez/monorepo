import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  expectedSettings,
  makeDocumentationHarness,
  normalizeSingleEntity,
  operationDocumentation,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('single-entity-put');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Single entity', () => {
    laymosDescribe(
      'Put',
      {
        description: 'Put saves a complete value at the singleton identity.',
        documentation: operationDocumentation(
          'Use `put` when the complete singleton value is known.',
          `const stored = yield* appSettings.put({ theme: 'dark', retries: 5 })`,
          'The first put creates storage and later puts replace the whole value.',
        ),
      },
      () => {
        laymosTest(
          'Saves the settings for the first time.',
          {
            description:
              'No settings record exists yet. Saving a complete value should create it and return the same values to the caller.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const stored = yield* trace(
                harness.provide(
                  harness.settings.put({
                    theme: 'dark',
                    retries: 5,
                  }),
                ),
              );

              expect(
                normalizeSingleEntity(stored),
                'The saved settings match the complete submitted value.',
              ).toEqual(expectedSettings('dark', 5));
            }),
        );

        laymosTest(
          'Replaces the previously saved settings with a complete new value.',
          {
            description:
              'Settings are already saved, and the caller supplies a complete replacement. The new value should replace the previous settings in full.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(
                harness.settings.put({ theme: 'dark', retries: 5 }),
              );

              const stored = yield* trace(
                harness.provide(
                  harness.settings.put({
                    theme: 'light',
                    retries: 8,
                  }),
                ),
              );

              expect(
                normalizeSingleEntity(stored),
                'The saved settings contain only the replacement value.',
              ).toEqual(expectedSettings('light', 8));
            }),
        );
      },
    );
  });
});
