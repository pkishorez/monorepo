import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Preferences, PreferencesRead } from '../../../../store.ts';

/** Keeps the microphone chosen in Preferences; a write that fails is lost. */
export const setMicrophone = Command.make('SetMicrophone', {
  args: Schema.Struct({ microphone: PreferencesRead.fields.microphone }),
  run: ({ microphone }) =>
    Effect.flatMap(Preferences, (store) =>
      store.setMicrophone(microphone),
    ).pipe(Effect.ignore),
});
