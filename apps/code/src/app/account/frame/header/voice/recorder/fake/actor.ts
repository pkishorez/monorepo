import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

/*
 * The Microphone fake: the microphones a person has plugged in, in a
 * Kabuki Actor that Requires nothing. It starts with one, the Built-in
 * Microphone, the first plugged in being the system default; the site may
 * use them at once. serve.ts records from it as the browser would
 * (`../recorder.ts`), its audio a voice's worth, made up (`sound.ts`).
 */

/** Who blank `PlugIn` plugs in. */
export const PLUGGED_IN = 'USB Microphone';

const Microphone = Schema.Struct({
  /** Its `deviceId`. */
  id: Schema.String,
  name: Schema.String,
});

const Model = Schema.Struct({
  /** The microphones plugged in, in the order they came. */
  microphones: Schema.Array(Microphone),
  /** How many were ever plugged in: what names the next one's id. */
  added: Schema.Int,
  /** The microphone recording now, by id; null when none is. */
  recording: Schema.NullOr(Schema.String),
  /** How many recordings were started. */
  recordings: Schema.Int,
});
export type MicrophoneModel = typeof Model.Type;

const Message = Schema.TaggedUnion({
  // Controls
  /** A microphone is plugged in (blank: a USB Microphone). */
  PlugIn: { name: Schema.String },

  // Sent by serve.ts, for what the page does.
  RecordingFrom: { id: Schema.String },
  RecordingEnded: {},
});
export type MicrophoneMessage = typeof Message.Type;

/** The Microphone fake's Controls. */
export const MICROPHONE_CONTROLS = ['PlugIn'] as const satisfies ReadonlyArray<
  MicrophoneMessage['_tag']
>;

/** Blank: the Built-in Microphone, nothing recording. */
export const blank = (): MicrophoneModel => ({
  microphones: [{ id: 'mic-1', name: 'Built-in Microphone' }],
  added: 1,
  recording: null,
  recordings: 0,
});

export const MicrophoneFake = Actor.define('Microphone', {
  model: Model,
  message: Message,
}).build({
  init: () => ({ model: blank() }),
  on: {
    PlugIn: ({ name }, { model }) => ({
      model: {
        microphones: [
          ...model.microphones,
          { id: `mic-${model.added + 1}`, name: name.trim() || PLUGGED_IN },
        ],
        added: model.added + 1,
      },
    }),
    RecordingFrom: ({ id }, { model }) => ({
      model: {
        recording: id,
        recordings:
          model.recording === null ? model.recordings + 1 : model.recordings,
      },
    }),
    RecordingEnded: () => ({ model: { recording: null } }),
  },
});
