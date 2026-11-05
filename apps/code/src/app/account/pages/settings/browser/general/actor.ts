import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Preferences, PreferencesRead } from '../../../../../storage/index.ts';
import {
  setContext,
  setFloating,
  setKeepScreenOn,
  setSmartDisplacement,
  setSmartInput,
  setTextSize,
} from './commands.ts';

/*
 * Settings → General: what this browser keeps for itself that the user
 * sets, from Preferences.
 *
 * 1. Read    whether the app floats as a window, the text size, the
 *            Microphone chosen, whether the Touch Draft takes Smart Input
 *            and Smart Displacement, when the Draft shows how full the
 *            context is, and whether the screen is kept on, and again after
 *            every write, here or in another tab. Vim Mode is the keyboard's,
 *            which the frame keeps; the frame follows the window too, once
 *            kept, and the root page whether the screen is kept on.
 * 2. Choose  the window, Smart Input, Smart Displacement, or keeping the
 *            screen on, on or off, a text size, or when the context shows,
 *            shown at once and kept.
 *            The Microphone is chosen in the Microphone Picker, which
 *            keeps it itself.
 */

const Device = Schema.Struct({
  floating: PreferencesRead.fields.floating,
  textSize: PreferencesRead.fields.textSize,
  microphone: PreferencesRead.fields.microphone,
  smartInput: PreferencesRead.fields.smartInput,
  smartDisplacement: PreferencesRead.fields.smartDisplacement,
  context: PreferencesRead.fields.context,
  keepScreenOn: PreferencesRead.fields.keepScreenOn,
});

export const General = Actor.define('General', {
  requires: [Preferences],
  model: Schema.Struct({
    /** Null until read. */
    device: Schema.NullOr(Device),
  }),
  message: Schema.TaggedUnion({
    Read: { device: Device },
    FloatingChosen: { on: Schema.Boolean },
    TextSizeChosen: { size: PreferencesRead.fields.textSize },
    SmartInputChosen: { on: Schema.Boolean },
    SmartDisplacementChosen: { on: Schema.Boolean },
    ContextChosen: { shown: PreferencesRead.fields.context },
    KeepScreenOnChosen: { on: Schema.Boolean },
  }),
});

export const GeneralLive = General.build({
  init: () => ({ model: { device: null } }),
  workers: {
    // 1. Read
    read: {
      run: (self) =>
        Stream.runForEach(
          Stream.concat(Stream.make(undefined), Preferences.changes),
          () =>
            Effect.flatMap(
              Preferences.read,
              ({
                floating,
                textSize,
                microphone,
                smartInput,
                smartDisplacement,
                context,
                keepScreenOn,
              }) =>
                self.send({
                  _tag: 'Read',
                  device: {
                    floating,
                    textSize,
                    microphone,
                    smartInput,
                    smartDisplacement,
                    context,
                    keepScreenOn,
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
    ContextChosen: ({ shown }, { model }) =>
      model.device === null || model.device.context === shown
        ? {}
        : {
            model: { device: { ...model.device, context: shown } },
            command: setContext({ shown }),
          },
    KeepScreenOnChosen: ({ on }, { model }) =>
      model.device === null || model.device.keepScreenOn === on
        ? {}
        : {
            model: { device: { ...model.device, keepScreenOn: on } },
            command: setKeepScreenOn({ on }),
          },
  },
});
