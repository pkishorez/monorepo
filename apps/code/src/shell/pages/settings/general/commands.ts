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
