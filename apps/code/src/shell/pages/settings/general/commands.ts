import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { DeviceState } from '../../../../layer/capabilities/index.ts';

/** Keeps whether the Touch Draft takes Smart Input in Device State; a write that fails is lost. */
export const setSmartInput = Command.make('SetSmartInput', {
  args: Schema.Struct({ on: Schema.Boolean }),
  run: ({ on }) =>
    Effect.flatMap(DeviceState, (store) => store.setSmartInput(on)).pipe(
      Effect.ignore,
    ),
});

/** Keeps whether the Touch Draft takes Smart Displacement in Device State; a write that fails is lost. */
export const setSmartDisplacement = Command.make('SetSmartDisplacement', {
  args: Schema.Struct({ on: Schema.Boolean }),
  run: ({ on }) =>
    Effect.flatMap(DeviceState, (store) => store.setSmartDisplacement(on)).pipe(
      Effect.ignore,
    ),
});

/** Keeps whether the app floats as a window in Device State; a write that fails is lost. */
export const setFloating = Command.make('SetFloating', {
  args: Schema.Struct({ on: Schema.Boolean }),
  run: ({ on }) =>
    Effect.flatMap(DeviceState, (store) => store.setFloating(on)).pipe(
      Effect.ignore,
    ),
});

/** Keeps the text size in Device State; a write that fails is lost. */
export const setTextSize = Command.make('SetTextSize', {
  args: Schema.Struct({ size: DeviceState.Device.fields.textSize }),
  run: ({ size }) =>
    Effect.flatMap(DeviceState, (store) => store.setTextSize(size)).pipe(
      Effect.ignore,
    ),
});
