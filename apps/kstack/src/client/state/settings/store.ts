import { Effect, ManagedRuntime } from 'effect';
import { StdTable } from '@kstackz/std-toolkit/db';
import { IDB } from '@kstackz/std-toolkit/db/idb';
import { createStdSync, strategy } from '@kstackz/std-toolkit/sync';
import {
  defaultSettings,
  Settings,
  SETTINGS_ID,
} from '../../../domain/settings/index.ts';

// How often a tab reads what another tab of this device changed.
const POLL = '2 seconds';

/** The device's own table, in this browser's IndexedDB: never on a server. */
const settingsTable = StdTable.make('settings')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .build();

const settings = settingsTable
  .entity(Settings)
  .primary({ pk: ['id'] })
  .index('LSI1', 'changes', { sk: ['_u'] })
  .build();

const key = { id: SETTINGS_ID };

/**
 * This device's Settings: one Collection over a table in IndexedDB, kept by
 * Std Sync in memory, the same way a User's money is kept over D1. Opened once
 * per tab, before anyone signs in, and never closed.
 */
const openSettings = () => {
  const runtime = ManagedRuntime.make(
    IDB.make(settingsTable, {
      database: IDB.database({ databaseName: 'device' }),
    }).layer,
  );
  const put = (value: Settings) =>
    Effect.gen(function* () {
      const stored = yield* settings.get(key);
      return stored === null
        ? yield* settings.insert(value)
        : yield* settings.getAndUpdate(key, value);
    });
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
    onInsert: (items) => Effect.forEach(items, put),
    onUpdate: ({ current, updates }) => put({ ...current, ...updates }),
  });
  return {
    collection,
    /** The Settings as stored, read straight from IndexedDB. */
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
        collection.insert({ ...defaultSettings, ...changes });
      }
    },
  };
};

export type DeviceSettings = ReturnType<typeof openSettings>;

let opened: DeviceSettings | undefined;

/** This tab's Settings, opened on first use. Browser only. */
export const deviceSettings = (): DeviceSettings => (opened ??= openSettings());
