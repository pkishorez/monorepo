import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { HarnessAccountInfo, SpeechToTextState } from '@kestack/connect/code';
import { Connection } from '@kestack/connect/cloud';
import { ConnectionCards } from '../store.ts';
import { HarnessAccounts } from './accounts/index.ts';
import { SpeechToText } from './speech/index.ts';
import { askForget } from './commands.ts';

/*
 * One Connection in Settings → Connections: its card, standing as the sidebar
 * says it, and its own settings, as its Connection's setup holds them, handed
 * in by the list.
 *
 * 1. Shown   its Agents: its Harness Accounts (`accounts/`) and its
 *            Speech to Text switch (`speech/`), each handed what its setup
 *            holds. Its Projects are not shown: they are never managed.
 * 2. Forget  asked of the list (`ConnectionCards`), which asks first.
 */

const ConnectionCard = Actor.define('ConnectionCard', {
  requires: [ConnectionCards],
  input: Schema.Struct({ connectionId: Schema.String }),
  props: Schema.Struct({
    connection: Connection.schema,
    /** What its setup holds; null before it knows. */
    accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo.schema)),
    speech: Schema.NullOr(SpeechToTextState.schema),
    /** Why its Connection could not be asked. */
    problem: Schema.NullOr(Schema.String),
  }),
  model: Schema.Struct({ connectionId: Schema.String }),
  message: Schema.TaggedUnion({ ForgetAsked: {} }),
});

export const ConnectionCardLive = ConnectionCard.build({
  init: ({ connectionId }) => ({ model: { connectionId } }),
  // 1. Shown
  children: {
    accounts: Actor.child(HarnessAccounts.actor, {
      input: ({ model }) => ({ connectionId: model.connectionId }),
      props: ({ props }) => ({
        accounts: props.accounts,
        problem: props.problem,
      }),
    }),
    speech: Actor.child(SpeechToText.actor, {
      input: ({ model }) => ({ connectionId: model.connectionId }),
      props: ({ props }) => ({ speech: props.speech }),
    }),
  },
  on: {
    // 2. Forget
    ForgetAsked: (_, { model }) => ({
      command: askForget({ id: model.connectionId }),
    }),
  },
});
