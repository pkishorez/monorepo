import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

/*
 * The Microphone fake: the microphones a person has plugged in and what
 * the browser lets the page do with them, in a Kabuki Actor that Requires
 * nothing. It starts with one, the Built-in Microphone, the site not yet
 * allowed to use it. serve.ts records from it as the browser would
 * (`../recorder.ts`), its audio made up (`sound.ts`).
 *
 * - Inputs      plugged in and unplugged, and which is the system default;
 *               one unplugged while it records ends the recording.
 * - Permission  asked the first time the page records or lists them, and
 *               waiting in `asking` until a Control allows or denies it.
 * - Opening     at once or slowly, broken (in use by something else), or
 *               blocked as iOS Safari at times does on its own, until the
 *               page is loaded again (`untilReload`).
 * - Sound       loud, a voice's worth, or silent.
 */

/** Who blank `PlugIn` plugs in. */
export const PLUGGED_IN = 'USB Microphone';

const Microphone = Schema.Struct({
  /** Its `deviceId`. */
  id: Schema.String,
  name: Schema.String,
});

const Permission = Schema.Literals(['Prompt', 'Allowed', 'Denied']);
export type Permission = typeof Permission.Type;

const Model = Schema.Struct({
  /** The microphones plugged in, in the order they came. */
  microphones: Schema.Array(Microphone),
  /** How many were ever plugged in: what names the next one's id. */
  added: Schema.Int,
  /** The system default's id; null for the first plugged in. */
  systemDefault: Schema.NullOr(Schema.String),
  /** Whether the site may use a microphone, or is yet to be asked. */
  permission: Permission,
  /** The browser asks the person now, and waits for an answer. */
  asking: Schema.Boolean,
  /** How long a microphone takes to open, in ms. */
  opensInMs: Schema.Int,
  /** Opening fails, as one in use by something else. */
  broken: Schema.Boolean,
  /** What a reload ends: blocked, as iOS Safari at times blocks on its own. */
  untilReload: Schema.Struct({ blocked: Schema.Boolean }),
  /** Loud, a voice's worth of sound; else silent. */
  loud: Schema.Boolean,
  /** The microphone recording now, by id; null when none is. */
  recording: Schema.NullOr(Schema.String),
  /** How many recordings were started. */
  recordings: Schema.Int,
});
export type MicrophoneModel = typeof Model.Type;

const Message = Schema.TaggedUnion({
  // Controls: inputs.
  /** A microphone is plugged in (blank: a USB Microphone). */
  PlugIn: { name: Schema.String },
  /** A microphone is unplugged (blank: the one recording, else the last plugged in). */
  Unplug: { name: Schema.String },
  /** The system default is this microphone. */
  MakeSystemDefault: { name: Schema.String },

  // Controls: permission.
  /** The person allows the site to use a microphone. */
  AllowMicrophone: {},
  /** The person denies it. */
  DenyMicrophone: {},
  /** The site's permission is reset: the next use asks again. */
  AskAgain: {},

  // Controls: opening and sound.
  /** A microphone takes this long to open (0: at once). */
  OpenSlowly: { seconds: Schema.Finite },
  /** Opening fails, as a microphone in use by something else. */
  BreakMicrophone: {},
  /** Opening works again. */
  MendMicrophone: {},
  /** The browser blocks the microphone until the page is loaded again, as iOS Safari does. */
  BlockUntilReload: {},
  /** The microphone hears a voice. */
  Loud: {},
  /** The microphone hears silence. */
  Silent: {},

  // Sent by serve.ts, for what the page does.
  PermissionAsked: {},
  RecordingFrom: { id: Schema.String },
  RecordingEnded: {},
});
export type MicrophoneMessage = typeof Message.Type;

/** The Microphone fake's Controls, in the bubble's order. */
export const MICROPHONE_CONTROLS = [
  'PlugIn',
  'Unplug',
  'MakeSystemDefault',
  'AllowMicrophone',
  'DenyMicrophone',
  'AskAgain',
  'OpenSlowly',
  'BreakMicrophone',
  'MendMicrophone',
  'BlockUntilReload',
  'Loud',
  'Silent',
] as const satisfies ReadonlyArray<MicrophoneMessage['_tag']>;

/** Blank: the Built-in Microphone, the site yet to be asked, loud. */
export const blank = (): MicrophoneModel => ({
  microphones: [{ id: 'mic-1', name: 'Built-in Microphone' }],
  added: 1,
  systemDefault: null,
  permission: 'Prompt',
  asking: false,
  opensInMs: 0,
  broken: false,
  untilReload: { blocked: false },
  loud: true,
  recording: null,
  recordings: 0,
});

const named = (model: MicrophoneModel, name: string) =>
  model.microphones.find((each) => each.name === name.trim());

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
    Unplug: ({ name }, { model }) => {
      const gone =
        name.trim() === ''
          ? (model.microphones.find(({ id }) => id === model.recording) ??
            model.microphones.at(-1))
          : named(model, name);
      return gone === undefined
        ? {}
        : {
            model: {
              microphones: model.microphones.filter(({ id }) => id !== gone.id),
              systemDefault:
                model.systemDefault === gone.id ? null : model.systemDefault,
            },
          };
    },
    MakeSystemDefault: ({ name }, { model }) => {
      const found = named(model, name);
      return found === undefined ? {} : { model: { systemDefault: found.id } };
    },
    AllowMicrophone: () => ({
      model: { permission: 'Allowed' as const, asking: false },
    }),
    DenyMicrophone: () => ({
      model: { permission: 'Denied' as const, asking: false },
    }),
    AskAgain: () => ({ model: { permission: 'Prompt' as const } }),
    OpenSlowly: ({ seconds }) => ({
      model: { opensInMs: Math.max(0, Math.round(seconds * 1000)) },
    }),
    BreakMicrophone: () => ({ model: { broken: true } }),
    MendMicrophone: () => ({ model: { broken: false } }),
    BlockUntilReload: () => ({ model: { untilReload: { blocked: true } } }),
    Loud: () => ({ model: { loud: true } }),
    Silent: () => ({ model: { loud: false } }),
    PermissionAsked: () => ({ model: { asking: true } }),
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
