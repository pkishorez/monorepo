import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { DeviceState } from '../../../../layer/capabilities/index.ts';

/** Saves the Bindings to Device State; a write that fails is lost, and what is read stays as it was. */
export const setBindings = Command.make('SetBindings', {
  args: Schema.Struct({ bindings: DeviceState.Device.fields.bindings }),
  run: ({ bindings }) =>
    Effect.flatMap(DeviceState, (store) => store.setBindings(bindings)).pipe(
      Effect.ignore,
    ),
});
