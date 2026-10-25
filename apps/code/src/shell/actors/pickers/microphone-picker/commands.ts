import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { DeviceState } from '../../../../layer/capabilities/index.ts';

/** Keeps the microphone chosen in Device State; a write that fails is lost. */
export const setMicrophone = Command.make('SetMicrophone', {
  args: Schema.Struct({ microphone: DeviceState.Device.fields.microphone }),
  run: ({ microphone }) =>
    Effect.flatMap(DeviceState, (store) =>
      store.setMicrophone(microphone),
    ).pipe(Effect.ignore),
});
