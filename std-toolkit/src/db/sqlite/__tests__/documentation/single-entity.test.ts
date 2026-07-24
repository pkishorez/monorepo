import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  expectedSettings,
  makeDocumentationHarness,
  normalizeSettings,
  storageDocumentation,
} from './documentation-harness.js';

const harness = makeDocumentationHarness();

beforeAll(() => Effect.runPromise(harness.setup));
afterAll(() => harness.close());

describe('SQLite', () => {
  laymosDescribe(
    'Single entity',
    {
      description:
        'A single entity stores one named value with a useful default and no caller-managed identity.',
      documentation: storageDocumentation(
        'Use a single entity for state where exactly one record can exist: application settings, a checkpoint, or tenant configuration. Its schema still has a name and version history, but no id field because asking callers to invent an id would misrepresent the domain.',
        'Before the first write, `get` returns the declared default as usable state with an absent `_u`. The default is not secretly persisted. `put`, `getAndUpdate`, and `reset` create real records and therefore return generated change markers. Reset is a write of the default, not deletion, so readers and synchronization consumers agree on the same new state.',
        `
const settings = table
  .singleEntity(SettingsSchema)
  .default({ theme: 'light', retries: 3 })

const current = yield* settings.get()
const saved = yield* settings.put({ theme: 'dark', retries: 5 })
const changed = yield* settings.getAndUpdate({ retries: 6 })
const reset = yield* settings.reset()
        `,
        'Put is unconditional and replaces the complete value. Get-and-update preserves fields outside a partial patch and can derive a patch from current state. A callback returning `null` is a no-op. Before storage exists, get-and-update treats the default as current and performs the first real write.',
      ),
    },
    () => {
      laymosTest(
        'Returns the default before the first record exists.',
        {
          description:
            'A fresh database has no settings row. Callers should still receive usable defaults, while the absent change marker makes it clear that nothing has been persisted yet.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            yield* harness.clear;

            const settings = yield* trace(
              harness.provide(harness.settings.get()),
            );

            expect(
              normalizeSettings(settings),
              'Fresh settings expose the default with no persisted change marker.',
            ).toEqual(expectedSettings('light', 3, 'absent'));
          }),
      );

      laymosTest(
        'Persists a complete replacement with a change marker.',
        {
          description:
            'Put represents the caller’s complete desired settings value. It should create or replace the singleton unconditionally and return the stored state.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            yield* harness.clear;

            const saved = yield* trace(
              harness.provide(
                harness.settings.put({ theme: 'dark', retries: 5 }),
              ),
            );

            expect(
              normalizeSettings(saved),
              'Put returns the complete persisted settings value.',
            ).toEqual(expectedSettings('dark', 5));
          }),
      );

      laymosTest(
        'Updates selected settings while preserving the others.',
        {
          description:
            'Only the retry count changes. Get-and-update should merge that partial into the stored settings and advance the change marker.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            yield* harness.clear;
            const saved = yield* harness.provide(
              harness.settings.put({ theme: 'dark', retries: 5 }),
            );

            const changed = yield* trace(
              harness.provide(harness.settings.getAndUpdate({ retries: 6 })),
            );

            expect(
              normalizeSettings(changed),
              'The retry count changes while the dark theme is preserved.',
            ).toEqual(expectedSettings('dark', 6));
            expect(
              changed.meta._u > saved.meta._u,
              'The partial settings update has a newer change marker.',
            ).toBe(true);
          }),
      );

      laymosTest(
        'Uses the default as current state for the first update.',
        {
          description:
            'No row exists yet, but the caller updates only one field. The operation should merge against the declared default and persist the resulting complete value.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            yield* harness.clear;

            const changed = yield* trace(
              harness.provide(
                harness.settings.getAndUpdate((current) => ({
                  retries: current.retries + 1,
                })),
              ),
            );

            expect(
              normalizeSettings(changed),
              'The first update preserves the default theme and increments its retry count.',
            ).toEqual(expectedSettings('light', 4));
          }),
      );

      laymosTest(
        'Leaves the singleton untouched when an update callback returns null.',
        {
          description:
            'The callback inspects current state and decides no write is needed. The value and `_u` should remain exactly as they were.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            yield* harness.clear;
            const saved = yield* harness.provide(
              harness.settings.put({ theme: 'dark', retries: 5 }),
            );

            const unchanged = yield* trace(
              harness.provide(harness.settings.getAndUpdate(() => null)),
            );

            expect(
              unchanged.meta._u,
              'A no-op settings update keeps the existing change marker.',
            ).toBe(saved.meta._u);
            expect(
              normalizeSettings(unchanged),
              'A no-op settings update returns the existing value.',
            ).toEqual(expectedSettings('dark', 5));
          }),
      );

      laymosTest(
        'Resets settings by writing the default as new state.',
        {
          description:
            'Settings currently differ from the default. Reset should persist the default and produce a newer change marker rather than deleting the record.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            yield* harness.clear;
            const saved = yield* harness.provide(
              harness.settings.put({ theme: 'dark', retries: 9 }),
            );

            const reset = yield* trace(
              harness.provide(harness.settings.reset()),
            );

            expect(
              normalizeSettings(reset),
              'Reset returns the declared default as persisted settings.',
            ).toEqual(expectedSettings('light', 3));
            expect(
              reset.meta._u > saved.meta._u,
              'Reset records a new settings change after the previous value.',
            ).toBe(true);
          }),
      );
    },
  );
});
