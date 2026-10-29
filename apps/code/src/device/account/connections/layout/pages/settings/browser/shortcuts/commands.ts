import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Preferences, PreferencesRead } from '../../../../../../../store.ts';

/** Saves the Bindings to Preferences; a write that fails is lost, and what is read stays as it was. */
export const setBindings = Command.make('SetBindings', {
  args: Schema.Struct({ bindings: PreferencesRead.fields.bindings }),
  run: ({ bindings }) =>
    Effect.flatMap(Preferences, (store) => store.setBindings(bindings)).pipe(
      Effect.ignore,
    ),
});
