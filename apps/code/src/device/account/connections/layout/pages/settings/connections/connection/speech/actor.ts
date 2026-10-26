import { Schema } from 'effect';
import { CodeClients, SpeechToTextState } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Refused } from '../../../../../../connection/link/index.ts';
import { switchSpeechToText } from './commands.ts';

/*
 * One Connection's Speech to Text switch (ADR 0017), over that Connection's own
 * socket.
 *
 * 1. Shown   how it stands, as its Connection's setup holds it: kept on this
 *            device, then watched live: off, downloading with how much of
 *            the model is in, ready, or failed.
 * 2. Switch  on is a wish the Connection keeps: it downloads the model and
 *            carries on after a restart; from failed, on again tries
 *            again. Off deletes the model. What came of it shows in what
 *            is watched; a refusal says why.
 */

const SpeechToText = Actor.define('SpeechToText', {
  requires: [CodeClients],
  input: Schema.Struct({ connectionId: Schema.String }),
  props: Schema.Struct({
    /** How it stands, as its setup holds it; null before it knows. */
    speech: Schema.NullOr(SpeechToTextState.schema),
  }),
  model: Schema.Struct({
    connectionId: Schema.String,
    /** Whether a switch is on its way to the Connection. */
    switching: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Switch: { on: Schema.Boolean },
    Switched: {},
    Refused,
  }),
});

export const SpeechToTextLive = Actor.build(SpeechToText, {
  init: ({ connectionId }) => ({
    model: { connectionId, switching: false, problem: null },
  }),
  on: {
    // 2. Switch
    Switch: ({ on }, { model }) =>
      model.switching
        ? {}
        : {
            model: { ...model, switching: true, problem: null },
            command: switchSpeechToText({
              connectionId: model.connectionId,
              on,
            }),
          },
    Switched: (_, { model }) => ({ model: { ...model, switching: false } }),
    Refused: ({ reason }, { model }) => ({
      model: { ...model, switching: false, problem: reason },
    }),
  },
});
