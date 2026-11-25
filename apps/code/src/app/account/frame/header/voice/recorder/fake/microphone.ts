import { Schema, SubscriptionRef } from 'effect';
import { Fake } from '@kestack/kabuki/fake';
import { microphoneOver } from './layer.ts';

/*
 * The Microphone fake: the microphones a person has plugged in. It starts
 * with one, the Built-in Microphone, the first plugged in being the
 * system default; the site may use them at once. Its control plugs one
 * more in. layer.ts records from it as the browser would
 * (`../recorder.ts`), its audio a voice's worth, made up (`sound.ts`).
 */

/** Who a blank `PlugIn` plugs in. */
const PLUGGED_IN = 'USB Microphone';

const Microphone = Schema.Struct({
  /** Its `deviceId`. */
  id: Schema.String,
  name: Schema.String,
});

export const MicrophoneState = Schema.Struct({
  /** The microphones plugged in, in the order they came. */
  microphones: Schema.Array(Microphone),
});
export type MicrophoneState = typeof MicrophoneState.Type;

/** The Microphone fake. Its Layer gives `Recorder`, the real one over it. */
export const microphone = Fake.make({
  name: 'microphone',
  state: MicrophoneState,
  initial: { microphones: [{ id: 'mic-1', name: 'Built-in Microphone' }] },
  controls: {
    /** A microphone is plugged in (blank: a USB Microphone). */
    PlugIn: Fake.control(
      MicrophoneState,
      Schema.Struct({ name: Schema.String }),
      ({ name }, state) =>
        SubscriptionRef.update(state, ({ microphones }) => ({
          microphones: [
            ...microphones,
            {
              // None is ever unplugged: the count names the next one.
              id: `mic-${microphones.length + 1}`,
              name: name.trim() || PLUGGED_IN,
            },
          ],
        })),
    ),
  },
  layer: microphoneOver,
});
