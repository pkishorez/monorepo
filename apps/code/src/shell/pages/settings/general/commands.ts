import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { DeviceState } from '../../../../layer/capabilities/index.ts';

/** Keeps how the Touch Draft is written in Device State; a write that fails is lost. */
export const setTouchMode = Command.make('SetTouchMode', {
  args: Schema.Struct({ mode: DeviceState.Device.fields.touchMode }),
  run: ({ mode }) =>
    Effect.flatMap(DeviceState, (store) => store.setTouchMode(mode)).pipe(
      Effect.ignore,
    ),
});
