import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  expectedSettings,
  makeDocumentationHarness,
  normalizeSingleEntity,
  operationDocumentation,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('single-entity-get');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Single entity', () => {
    laymosDescribe(
      'Get',
      {
        description:
          'Get always returns usable singleton state, whether defaulted or persisted.',
        documentation: operationDocumentation(
          'Use `get` to read the one value owned by a single-entity schema.',
          `const settings = yield* appSettings.get()`,
          'Before the first write, the configured default is returned with an absent cursor. Persisted state has a generated cursor.',
        ),
      },
      () => {
        laymosTest(
          'Returns the configured settings before anything has been saved.',
          {
            description:
              'The settings record has never been written. Reading it should still return the configured defaults so callers always have usable settings.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const settings = yield* trace(
                harness.provide(harness.settings.get()),
              );

              expect(
                normalizeSingleEntity(settings),
                'The returned settings match the configured defaults.',
              ).toEqual(expectedSettings('light', 3, 'absent'));
            }),
        );

        laymosTest(
          'Returns the saved settings after the first write.',
          {
            description:
              'Settings have been saved after startup. Reading them should return the saved values instead of the configured defaults.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(
                harness.settings.put({ theme: 'dark', retries: 5 }),
              );

              const settings = yield* trace(
                harness.provide(harness.settings.get()),
              );

              expect(
                normalizeSingleEntity(settings),
                'The returned settings match the saved values.',
              ).toEqual(expectedSettings('dark', 5));
            }),
        );
      },
    );
  });
});
