import { Schema } from 'effect';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

/** Whether Switch User changes the User of every tab, or of this tab only. */
export const Switching = Schema.Literals(['browser', 'tab']);
export type Switching = typeof Switching.Type;

/**
 * How Ledger looks, sounds and is driven on this device, the same for every
 * User of it; one per device. `keys` are its own Bindings, written as people
 * write them (`mod+k`, `g g`), by Action id. `keysOn` and `gesturesOn` say
 * whether Keys and the Thumb Lock work. `gestureSounds` is whether the Thumb
 * Lock sounds; `sound` is for Commands.
 */
export const Settings = EntityESchema.make('settings', 'id', {
  sound: Schema.Boolean,
  gestureSounds: Schema.Boolean,
  keys: Schema.Record(Schema.String, Schema.String),
  keysOn: Schema.Boolean,
  gesturesOn: Schema.Boolean,
  switching: Switching,
}).build();
export type Settings = typeof Settings.Type;

/** The one Settings of this device. */
export const SETTINGS_ID = 'device';

export const defaultSettings: Settings = {
  id: SETTINGS_ID,
  sound: true,
  gestureSounds: true,
  keys: {},
  keysOn: true,
  gesturesOn: true,
  switching: 'browser',
};
