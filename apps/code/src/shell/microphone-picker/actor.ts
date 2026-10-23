import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import * as Picker from '../../ui/picker/index.ts';
import { DeviceState } from '../device-state/index.ts';
import { Recorder } from '../recorder/index.ts';

/*
 * The Microphone Picker: which of this browser's microphones a Dictation
 * records from.
 *
 * 1. Read    the microphones, the system default first, followed while it
 *            is open, so one plugged in or out shows at once; their names
 *            need the site to be let use a microphone, so it is asked
 *            first, and refused, it says why.
 * 2. Pick    one is kept in Device State, as this browser's own; the one
 *            chosen is checked, and the system default while the one
 *            chosen is not connected, since that is what records then. A
 *            Dictation recording takes it up at once.
 */

const Input = Schema.Struct({
  deviceId: Schema.NullOr(Schema.String),
  label: Schema.String,
});
type Input = typeof Input.Type;

/** The system default's row; the browser's own `default` is never listed as an input. */
const DEFAULT = 'default';

const Listing = Schema.Struct({
  inputs: Schema.NullOr(Schema.Array(Input)),
  /** The one chosen in Device State; null for the system default. */
  chosen: Schema.NullOr(Schema.String),
  /** Why they could not be listed. */
  problem: Schema.NullOr(Schema.String),
});
type Listing = typeof Listing.Type;

/** The rows, as the Step lists them. */
export const rowsOf = ({ inputs, chosen }: Listing) => {
  const listed = inputs ?? [];
  const connected = listed.some(({ deviceId }) => deviceId === chosen);
  return listed.map(({ deviceId, label }, at) =>
    deviceId === null
      ? {
          value: DEFAULT,
          label: 'System default',
          ...(label === '' ? {} : { hint: label }),
          ...(chosen !== null && !connected
            ? { detail: "The one chosen isn't connected" }
            : {}),
          checked: chosen === null || !connected,
        }
      : {
          value: deviceId,
          label: label || `Microphone ${at}`,
          checked: deviceId === chosen,
        },
  );
};

const Microphones = Picker.make('MicrophonePicker', {
  props: Listing,
  steps: {
    input: {
      placeholder: () => 'Search microphones',
      empty: () => 'No microphone by that name',
      rows: ({ props }) => ({
        rows: rowsOf(props),
        loading: props.inputs === null && props.problem === null,
        problem: props.problem,
      }),
    },
  },
});

export const MicrophonePicker = Actor.define('MicrophonePicker', {
  requires: [Recorder, DeviceState.Store],
  props: Schema.Struct({ chosen: Schema.NullOr(Schema.String) }),
  model: Schema.Struct({
    picking: Schema.NullOr(Picker.How),
    opened: Schema.Finite,
    inputs: Schema.NullOr(Schema.Array(Input)),
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Open: { how: Picker.How },
    Read: { inputs: Schema.Array(Input) },
    Refused: { reason: Schema.String },
    Closed: {},
    /** The row chosen: a `deviceId`, or the system default's. */
    Chose: { value: Schema.String },
  }),
});

export const MicrophonePickerLive = Actor.build(MicrophonePicker, {
  init: () => ({
    model: { picking: null, opened: 0, inputs: null, problem: null },
  }),
  children: {
    picker: {
      actor: Microphones.Live,
      while: ({ model }) => model.picking !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model }) => ({
        how: model.picking ?? 'keys',
        step: { id: 'input', key: '' },
        choices: [],
      }),
      props: ({ model, props }) => ({
        inputs: model.inputs,
        chosen: props.chosen,
        problem: model.problem,
      }),
    },
  },
  provides: (self) =>
    Microphones.owner({
      done: (choices) => {
        const chosen = choices?.at(-1)?.value;
        return self.send(
          chosen === undefined
            ? { _tag: 'Closed' }
            : { _tag: 'Chose', value: chosen },
        );
      },
    }),
  workers: {
    // 1. Read
    inputs: {
      while: ({ model }) => model.picking !== null,
      run: (self) =>
        Effect.flatMap(Recorder, ({ inputs }) =>
          Stream.runForEach(inputs, (listed) =>
            self.send({ _tag: 'Read', inputs: listed }),
          ),
        ).pipe(
          Effect.catch(({ reason }) => self.send({ _tag: 'Refused', reason })),
        ),
    },
  },
  on: {
    Open: ({ how }, { model }) =>
      model.picking !== null
        ? {}
        : {
            model: {
              ...model,
              picking: how,
              opened: model.opened + 1,
              problem: null,
            },
          },
    Read: ({ inputs }, { model }) => ({
      model: { ...model, inputs, problem: null },
    }),
    Refused: ({ reason }, { model }) => ({
      model: { ...model, problem: reason },
    }),
    Closed: (_, { model }) => ({ model: { ...model, picking: null } }),
    // 2. Pick
    Chose: ({ value }, { model }) => ({
      model: { ...model, picking: null },
      command: DeviceState.setMicrophone({
        microphone: value === DEFAULT ? null : value,
      }),
    }),
  },
});

export const MicrophonesView = Microphones.View;
