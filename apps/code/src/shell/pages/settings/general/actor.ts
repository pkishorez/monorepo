import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { DeviceState } from '../../../../layer/capabilities/index.ts';
import { setTouchMode } from './commands.ts';

/*
 * Settings → General: what this browser keeps for itself that the user
 * sets, from Device State.
 *
 * 1. Read    the Microphone chosen and how the Touch Draft is written,
 *            and again after every write, here or in another tab. Vim
 *            Mode is the keyboard's, which the root page keeps.
 * 2. Choose  text or voice for the Touch Draft, shown at once and kept.
 *            The Microphone is chosen in the Microphone Picker, which
 *            keeps it itself.
 */

const Device = Schema.Struct({
  microphone: DeviceState.Device.fields.microphone,
  touchMode: DeviceState.Device.fields.touchMode,
});

export const General = Actor.define('General', {
  requires: [DeviceState],
  model: Schema.Struct({
    /** Null until read. */
    device: Schema.NullOr(Device),
  }),
  message: Schema.TaggedUnion({
    Read: { device: Device },
    TouchModeChosen: { mode: Device.fields.touchMode },
  }),
});

export const GeneralLive = Actor.build(General, {
  init: () => ({ model: { device: null } }),
  workers: {
    // 1. Read
    read: {
      run: (self) =>
        Stream.runForEach(
          Stream.concat(Stream.make(undefined), DeviceState.changes),
          () =>
            Effect.flatMap(DeviceState.read, ({ microphone, touchMode }) =>
              self.send({ _tag: 'Read', device: { microphone, touchMode } }),
            ),
        ),
    },
  },
  on: {
    Read: ({ device }) => ({ model: { device } }),
    // 2. Choose
    TouchModeChosen: ({ mode }, { model }) =>
      model.device === null || model.device.touchMode === mode
        ? {}
        : {
            model: { device: { ...model.device, touchMode: mode } },
            command: setTouchMode({ mode }),
          },
  },
});
