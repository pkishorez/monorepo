import { Effect, type Layer, ManagedRuntime } from 'effect';
import type { StdTableService } from '@kstackz/std-toolkit/db';
import { createStdSync, strategy } from '@kstackz/std-toolkit/sync';
import {
  defaultSettings,
  Settings,
  SETTINGS_ID,
  settingsEntity as settings,
  settingsTable,
} from './settings.ts';

// How often a tab reads what another tab of this device changed.
const POLL = '2 seconds';

const key = { id: SETTINGS_ID };

/**
 * This device's Settings: one Collection over `table`, kept by Std Sync in
 * memory, the same way a User's money is kept over D1. Opened once, before
 * anyone signs in, and never closed.
 */
export const openSettings = (
  table: Layer.Layer<StdTableService<typeof settingsTable.logicalName>>,
) => {
  const runtime = ManagedRuntime.make(table);
  // Writes `changed` over what is stored, or `value` when nothing is yet. A
  // change made before the stored Settings were read keeps the rest of them.
  const put = (value: Settings, changed: Partial<Settings>) =>
    Effect.gen(function* () {
      const stored = yield* settings.get(key);
      return stored === null
        ? yield* settings.insert(value)
        : yield* settings.getAndUpdate(key, { ...stored.value, ...changed });
    });
  // What was changed while the stored Settings were still unread.
  let early: Partial<Omit<Settings, 'id'>> = {};
  const sync = createStdSync({ name: 'device', runtime });
  const collection = sync.collection(Settings, {
    sync: {
      global: strategy.oldToNew({
        fetch: ({ after }) =>
          settings
            .query('changes', {
              pk: key,
              '>': after === null ? null : { _u: after.meta._u },
            })
            .pipe(Effect.map((page) => page.items)),
        pollEvery: POLL,
      }),
    },
    onInsert: (items) =>
      Effect.forEach(items, (item) => put(item, { ...early })),
    onUpdate: ({ current, updates }) =>
      put({ ...current, ...updates }, updates),
  });
  return {
    collection,
    /** The Settings as stored, read straight from the table. */
    read: (): Promise<Settings> =>
      runtime.runPromise(
        settings
          .get(key)
          .pipe(
            Effect.map((stored) =>
              stored === null ? defaultSettings : stored.value,
            ),
          ),
      ),
    /** Changes some Settings; shows at once in this tab. */
    change: (changes: Partial<Omit<Settings, 'id'>>) => {
      if (collection.has(SETTINGS_ID)) {
        collection.update(SETTINGS_ID, (draft) => {
          Object.assign(draft, changes);
        });
      } else {
        early = { ...early, ...changes };
        collection.insert({ ...defaultSettings, ...changes });
      }
    },
  };
};

export type DeviceSettings = ReturnType<typeof openSettings>;
