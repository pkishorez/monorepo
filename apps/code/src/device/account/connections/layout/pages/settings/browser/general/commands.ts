import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Preferences, PreferencesRead } from '../../../../../../../store.ts';

/** Keeps whether the Touch Draft takes Smart Input in Preferences; a write that fails is lost. */
export const setSmartInput = Command.make('SetSmartInput', {
  args: Schema.Struct({ on: Schema.Boolean }),
  run: ({ on }) =>
    Effect.flatMap(Preferences, (store) => store.setSmartInput(on)).pipe(
      Effect.ignore,
    ),
});

/** Keeps whether the Touch Draft takes Smart Displacement in Preferences; a write that fails is lost. */
export const setSmartDisplacement = Command.make('SetSmartDisplacement', {
  args: Schema.Struct({ on: Schema.Boolean }),
  run: ({ on }) =>
    Effect.flatMap(Preferences, (store) => store.setSmartDisplacement(on)).pipe(
      Effect.ignore,
    ),
});

/** Keeps whether the app floats as a window in Preferences; a write that fails is lost. */
export const setFloating = Command.make('SetFloating', {
  args: Schema.Struct({ on: Schema.Boolean }),
  run: ({ on }) =>
    Effect.flatMap(Preferences, (store) => store.setFloating(on)).pipe(
      Effect.ignore,
    ),
});

/** Keeps the text size in Preferences; a write that fails is lost. */
export const setTextSize = Command.make('SetTextSize', {
  args: Schema.Struct({ size: PreferencesRead.fields.textSize }),
  run: ({ size }) =>
    Effect.flatMap(Preferences, (store) => store.setTextSize(size)).pipe(
      Effect.ignore,
    ),
});
