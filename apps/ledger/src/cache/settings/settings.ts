import { Schema } from 'effect';
import { StdTable } from '@kstackz/std-toolkit/db';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

// The Backend as Settings kept it from v3 to v4, under its former names.
const FormerBackend = Schema.Literals(['remote', 'local']);

/**
 * How Ledger looks, sounds and is driven on this device, the same for every
 * User of it; one per device. `keys` are its own Bindings, written as people
 * write them (`mod+k`, `g g`), by Action id. `keysOn` and `gesturesOn` say
 * whether Keys and the Thumb Lock work. `sound` is whether Ledger sounds at
 * all: Commands, the Thumb Lock and swiping a row alike. `haptics` is
 * whether the Thumb Lock buzzes on a phone, apart from `sound`.
 */
export const Settings = EntityESchema.make('settings', 'id', {
  sound: Schema.Boolean,
  gestureSounds: Schema.Boolean,
  keys: Schema.Record(Schema.String, Schema.String),
  keysOn: Schema.Boolean,
  gesturesOn: Schema.Boolean,
  switching: Schema.Literals(['browser', 'tab']),
})
  // One Sounds setting for everything: gestures follow it too.
  .evolve(
    'v2',
    { gestureSounds: null },
    ({ id, sound, keys, keysOn, gesturesOn, switching }) => ({
      id,
      sound,
      keys,
      keysOn,
      gesturesOn,
      switching,
    }),
  )
  // Switch User reaches every tab, so it is no longer a setting; the Backend
  // is, and every device starts on the cloud Backend (now the cloud one).
  .evolve(
    'v3',
    { switching: null, backend: FormerBackend },
    ({ id, sound, keys, keysOn, gesturesOn }) => ({
      id,
      sound,
      keys,
      keysOn,
      gesturesOn,
      backend: 'remote' as const,
    }),
  )
  // Gesture Haptics follow their own switch, on until a User turns it off.
  .evolve(
    'v4',
    { haptics: Schema.Boolean },
    ({ id, sound, keys, keysOn, gesturesOn, backend }) => ({
      id,
      sound,
      haptics: true,
      keys,
      keysOn,
      gesturesOn,
      backend,
    }),
  )
  // The Backend is the Gate's to keep, apart from Settings.
  .evolve(
    'v5',
    { backend: null },
    ({ id, sound, haptics, keys, keysOn, gesturesOn }) => ({
      id,
      sound,
      haptics,
      keys,
      keysOn,
      gesturesOn,
    }),
  )
  .build();
export type Settings = typeof Settings.Type;

/** The one Settings of this device. */
export const SETTINGS_ID = 'device';

export const defaultSettings: Settings = {
  id: SETTINGS_ID,
  sound: true,
  haptics: true,
  keys: {},
  keysOn: true,
  gesturesOn: true,
};

/** The device's own table: never on a server. Its local index sorts by the
 * last change, so another tab reads "everything after" in one query. */
export const settingsTable = StdTable.make('settings')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .build();

export const settingsEntity = settingsTable
  .entity(Settings)
  .primary({ pk: ['id'] })
  .index('LSI1', 'changes', { sk: ['_u'] })
  .build();
