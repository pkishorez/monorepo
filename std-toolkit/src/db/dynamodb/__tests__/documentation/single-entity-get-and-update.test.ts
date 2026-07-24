import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  expectedSettings,
  makeDocumentationHarness,
  normalizeSingleEntity,
  operationDocumentation,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('single-entity-get-and-update');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Single entity', () => {
    laymosDescribe(
      'Get and update',
      {
        description:
          'Get and update derives singleton state from the latest stored value or configured default.',
        documentation: operationDocumentation(
          'Use `getAndUpdate` when the next singleton value depends on current state.',
          `const updated = yield* appSettings.getAndUpdate(current => ({ retries: current.retries + 1 }))`,
          'The default can seed the first write. Returning `null` skips persistence and preserves the cursor.',
        ),
      },
      () => {
        laymosTest(
          'Calculates and saves new settings from the configured defaults.',
          {
            description:
              'Settings have never been saved, so the calculation starts from the configured defaults. The calculated value should become the first saved settings.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const updated = yield* trace(
                harness.provide(
                  harness.settings.getAndUpdate((current) => ({
                    retries: current.retries + 1,
                  })),
                ),
              );

              expect(
                normalizeSingleEntity(updated),
                'The saved retry count is calculated from the default value.',
              ).toEqual(expectedSettings('light', 4));
            }),
        );

        laymosTest(
          'Calculates and saves new settings from the latest saved value.',
          {
            description:
              'Settings are already saved. The calculation should use those latest values and persist the result.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(
                harness.settings.put({ theme: 'dark', retries: 5 }),
              );

              const updated = yield* trace(
                harness.provide(
                  harness.settings.getAndUpdate((current) => ({
                    retries: current.retries + 1,
                  })),
                ),
              );

              expect(
                normalizeSingleEntity(updated),
                'The saved retry count is calculated from the latest value.',
              ).toEqual(expectedSettings('dark', 6));
            }),
        );

        laymosTest(
          'Leaves the saved settings unchanged when no update is requested.',
          {
            description:
              'The caller inspects the saved settings and decides that nothing needs to change. No write should occur and the change marker should remain the same.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              const current = yield* harness.provide(
                harness.settings.put({
                  theme: 'dark',
                  retries: 5,
                }),
              );

              const skipped = yield* trace(
                harness.provide(harness.settings.getAndUpdate(() => null)),
              );

              expect(
                skipped.meta._u,
                'The settings keep the same change marker because nothing was written.',
              ).toBe(current.meta._u);
            }),
        );
      },
    );
  });
});
