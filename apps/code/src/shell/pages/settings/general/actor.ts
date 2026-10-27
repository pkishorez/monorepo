import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { DeviceState } from '../../../../layer/capabilities/index.ts';
import {
  setFloating,
  setSmartDisplacement,
  setSmartInput,
  setTextSize,
} from './commands.ts';

/*
 * Settings → General: what this browser keeps for itself that the user
 * sets, from Device State.
 *
 * 1. Read    whether the app floats as a window, the text size, the
 *            Microphone chosen
 *            and whether the Touch Draft takes Smart Input and Smart
 *            Displacement, and again after every write, here or in
 *            another tab. Vim Mode is the keyboard's, which the root page
 *            keeps; the root page follows the window too, once kept.
 * 2. Choose  the window, Smart Input, or Smart Displacement, on or off,
 *            or a text size, shown at once and kept.
 *            The Microphone is chosen in the Microphone Picker, which
 *            keeps it itself.
 */

const Device = Schema.Struct({
  floating: DeviceState.Device.fields.floating,
  textSize: DeviceState.Device.fields.textSize,
  microphone: DeviceState.Device.fields.microphone,
  smartInput: DeviceState.Device.fields.smartInput,
  smartDisplacement: DeviceState.Device.fields.smartDisplacement,
});

export const General = Actor.define('General', {
  requires: [DeviceState],
  model: Schema.Struct({
    /** Null until read. */
    device: Schema.NullOr(Device),
  }),
  message: Schema.TaggedUnion({
    Read: { device: Device },
    FloatingChosen: { on: Schema.Boolean },
    TextSizeChosen: { size: DeviceState.Device.fields.textSize },
    SmartInputChosen: { on: Schema.Boolean },
    SmartDisplacementChosen: { on: Schema.Boolean },
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
            Effect.flatMap(
              DeviceState.read,
              ({
                floating,
                textSize,
                microphone,
                smartInput,
                smartDisplacement,
              }) =>
                self.send({
                  _tag: 'Read',
                  device: {
                    floating,
                    textSize,
                    microphone,
                    smartInput,
                    smartDisplacement,
                  },
                }),
            ),
        ),
    },
  },
  on: {
    Read: ({ device }) => ({ model: { device } }),
    // 2. Choose
    FloatingChosen: ({ on }, { model }) =>
      model.device === null || model.device.floating === on
        ? {}
        : {
            model: { device: { ...model.device, floating: on } },
            command: setFloating({ on }),
          },
    TextSizeChosen: ({ size }, { model }) =>
      model.device === null || model.device.textSize === size
        ? {}
        : {
            model: { device: { ...model.device, textSize: size } },
            command: setTextSize({ size }),
          },
    SmartInputChosen: ({ on }, { model }) =>
      model.device === null || model.device.smartInput === on
        ? {}
        : {
            model: { device: { ...model.device, smartInput: on } },
            command: setSmartInput({ on }),
          },
    SmartDisplacementChosen: ({ on }, { model }) =>
      model.device === null || model.device.smartDisplacement === on
        ? {}
        : {
            model: { device: { ...model.device, smartDisplacement: on } },
            command: setSmartDisplacement({ on }),
          },
  },
});
