import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { beforeAll, describe } from 'vitest';

import {
  expectedSettings,
  makeDocumentationHarness,
  normalizeSettings,
  storageDocumentation,
} from './documentation-harness.js';

const harness = makeDocumentationHarness();

beforeAll(() => Effect.runPromise(harness.setup));

describe('IndexedDB', () => {
  laymosDescribe(
    'Single entity',
    {
      description:
        'A browser singleton exposes defaults immediately and becomes a real versioned record when changed.',
      documentation: storageDocumentation(
        'Use an IndexedDB single entity for browser-owned state where exactly one named value exists. It is useful for settings, local checkpoints, and configuration shared by every view in the application. The schema name identifies the record; no arbitrary id is required.',
        'The declared default is virtual until a write occurs. A fresh `get` returns it with an empty `_u`, which means “usable but not stored.” `put`, `getAndUpdate`, and `reset` run through IndexedDB and return generated concurrency markers. Updates re-check `_u` in the native transaction, allowing concurrent tabs to retry rather than overwrite each other silently.',
        `
const settings = table
  .singleEntity(SettingsSchema)
  .default({ theme: 'light', retries: 3 })

const current = yield* settings.get()
const changed = yield* settings.getAndUpdate({ theme: 'dark' })
const reset = yield* settings.reset()
        `,
        'A first update merges with the default and creates the record. A callback returning `null` performs no write. Reset writes the default as a new observable state; it does not remove the singleton.',
      ),
    },
    () => {
      laymosTest(
        'Returns an unpersisted default in a fresh browser database.',
        {
          description:
            'No settings record exists yet. The application can still render immediately from defaults, and the absent marker distinguishes that virtual value from stored state.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            yield* harness.clear;

            const settings = yield* trace(
              harness.provide(harness.settings.get()),
            );

            expect(
              normalizeSettings(settings),
              'Fresh browser settings expose the default without a persisted marker.',
            ).toEqual(expectedSettings('light', 3, 'absent'));
          }),
      );

      laymosTest(
        'Creates and replaces the complete singleton value.',
        {
          description:
            'Put is an unconditional complete replacement. A second put should supersede the first and return a newer IndexedDB change marker.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            yield* harness.clear;
            const first = yield* harness.provide(
              harness.settings.put({ theme: 'dark', retries: 5 }),
            );

            const second = yield* trace(
              harness.provide(
                harness.settings.put({ theme: 'light', retries: 8 }),
              ),
            );

            expect(
              normalizeSettings(second),
              'The second put is the complete current settings value.',
            ).toEqual(expectedSettings('light', 8));
            expect(
              second.meta._u > first.meta._u,
              'Replacing settings creates a newer IndexedDB change marker.',
            ).toBe(true);
          }),
      );

      laymosTest(
        'Merges an update with stored settings.',
        {
          description:
            'The caller changes only retries. The existing theme should survive, and the guarded write should advance `_u`.',
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
              'The update changes retries while preserving the stored theme.',
            ).toEqual(expectedSettings('dark', 6));
            expect(
              changed.meta._u > saved.meta._u,
              'The guarded update has a newer concurrency marker.',
            ).toBe(true);
          }),
      );

      laymosTest(
        'Uses defaults to complete the first partial update.',
        {
          description:
            'There is no record to read yet. The callback should receive defaults as current state, and its partial result should become a complete persisted singleton.',
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
              'The first update combines the default theme with the derived retry count.',
            ).toEqual(expectedSettings('light', 4));
          }),
      );

      laymosTest(
        'Skips storage when an update callback returns null.',
        {
          description:
            'The callback determines that current settings need no change. No object-store write should occur, and the same `_u` should be returned.',
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
              'A skipped browser settings update preserves its concurrency marker.',
            ).toBe(saved.meta._u);
            expect(
              normalizeSettings(unchanged),
              'A skipped browser settings update preserves its value.',
            ).toEqual(expectedSettings('dark', 5));
          }),
      );

      laymosTest(
        'Resets by persisting defaults as a newer singleton state.',
        {
          description:
            'Reset is observable state change. It should write the defaults, leave the singleton readable, and advance `_u` beyond the prior value.',
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
              'Reset persists the declared browser settings defaults.',
            ).toEqual(expectedSettings('light', 3));
            expect(
              reset.meta._u > saved.meta._u,
              'Reset creates a newer browser settings state.',
            ).toBe(true);
          }),
      );
    },
  );
});
