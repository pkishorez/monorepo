import { Effect, Schema, Stream } from 'effect';
import { CodeClients, SpeechToTextState } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import {
  Machines,
  SavedMachines,
} from '../../../../../layer/capabilities/index.ts';
import { Refused } from '../../../../machines/index.ts';
import { keepSpeech, switchSpeechToText } from './commands.ts';

/*
 * One Machine's Speech to Text switch (ADR 0017), over that Machine's own
 * socket.
 *
 * 1. Kept    how it last stood, as kept on this device for its Account
 *            and handed in, shown at once.
 * 2. Watch   how it stands, live, as `Machines` says it: off, downloading
 *            with how much of the model is in, ready, or failed. A Machine
 *            that does not answer says once it does; what it says
 *            replaces what is shown, and is kept, a download's progress
 *            only as it starts.
 * 3. Switch  on is a wish the Machine keeps: it downloads the model and
 *            carries on after a restart; from failed, on again tries
 *            again. Off deletes the model. What came of it shows in what
 *            is watched; a refusal says why.
 */

const SpeechToText = Actor.define('SpeechToText', {
  requires: [CodeClients, Machines, SavedMachines],
  input: Schema.Struct({
    machineId: Schema.String,
    accountId: Schema.String,
    /** How this device kept it; null if it never heard. */
    kept: Schema.NullOr(SpeechToTextState),
  }),
  model: Schema.Struct({
    machineId: Schema.String,
    accountId: Schema.String,
    /** How it stands: as kept on this device, or as the Machine says; null before either. */
    state: Schema.NullOr(SpeechToTextState),
    /** Whether the Machine has said since this was opened. */
    heard: Schema.Boolean,
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
  init: ({ machineId, accountId, kept }) => ({
    model: {
      machineId,
      accountId,
      state: kept,
      heard: false,
      switching: false,
      problem: null,
    },
  }),
  workers: {
    // 2. Watch
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
    // 2. Watch
    Watched: ({ state }, { model }) => {
      const progress =
        model.heard &&
        model.state?._tag === 'Downloading' &&
        state._tag === 'Downloading';
      return {
        model: { ...model, state, heard: true },
        ...(progress
          ? {}
          : {
              command: keepSpeech({
                accountId: model.accountId,
                machineId: model.machineId,
                state,
              }),
            }),
      };
    },
    // 3. Switch
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
