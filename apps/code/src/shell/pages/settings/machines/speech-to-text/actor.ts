import { Effect, Schema, Stream } from 'effect';
import { CodeClients, SpeechToTextState } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Machines } from '../../../../../layer/capabilities/index.ts';
import { Refused } from '../../../../refusal/index.ts';
import { switchSpeechToText } from './commands.ts';

/*
 * One Machine's Speech to Text switch (ADR 0017), over that Machine's own
 * socket.
 *
 * 1. Watch   how it stands, live, as `Machines` says it: off, downloading
 *            with how much of the model is in, ready, or failed. A Machine
 *            that does not answer says once it does.
 * 2. Switch  on is a wish the Machine keeps: it downloads the model and
 *            carries on after a restart; from failed, on again tries
 *            again. Off deletes the model. What came of it shows in what
 *            is watched; a refusal says why.
 */

const SpeechToText = Actor.define('SpeechToText', {
  requires: [CodeClients, Machines],
  input: Schema.Struct({ machineId: Schema.String }),
  model: Schema.Struct({
    machineId: Schema.String,
    /** How it stands; null until the Machine first says. */
    state: Schema.NullOr(SpeechToTextState),
    /** Whether a switch is on its way to the Machine. */
    switching: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Watched: { state: SpeechToTextState },
    Switch: { on: Schema.Boolean },
    Switched: {},
    Refused,
  }),
});

export const SpeechToTextLive = Actor.build(SpeechToText, {
  init: ({ machineId }) => ({
    model: { machineId, state: null, switching: false, problem: null },
  }),
  workers: {
    // 1. Watch
    watch: {
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const { speech } = yield* Machines;
          yield* speech(model.machineId).pipe(
            Stream.filter((state) => state !== null),
            Stream.runForEach((state) => self.send({ _tag: 'Watched', state })),
          );
        }),
    },
  },
  on: {
    Watched: ({ state }, { model }) => ({ model: { ...model, state } }),
    // 2. Switch
    Switch: ({ on }, { model }) =>
      model.switching
        ? {}
        : {
            model: { ...model, switching: true, problem: null },
            command: switchSpeechToText({ machineId: model.machineId, on }),
          },
    Switched: (_, { model }) => ({ model: { ...model, switching: false } }),
    Refused: ({ reason }, { model }) => ({
      model: { ...model, switching: false, problem: reason },
    }),
  },
});
