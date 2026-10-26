import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import {
  HarnessAccountInfo,
  Connection,
  SpeechToTextState,
} from '@kestack/connect/code';
import { ConnectionCards } from '../store.ts';
import { HarnessAccounts } from './accounts/index.ts';
import { ConnectionProjects } from './projects/index.ts';
import { SpeechToText } from './speech/index.ts';
import { askForget } from './commands.ts';

/*
 * One Connection in Settings → Connections: its card, standing as the sidebar
 * says it, and its own settings, as its Connection's setup holds them, handed
 * in by the list.
 *
 * 1. Shown   its Harness Accounts (`accounts/`) and its Speech to Text
 *            switch (`speech/`), each handed what its setup holds, and its
 *            Projects (`projects/`).
 * 2. Tabs    its Agents, the first two, or its Projects, as its tabs
 *            chose, Agents until then.
 * 3. Forget  asked of the list (`ConnectionCards`), which asks first.
 */

/** A Connection's tab: its agents' accounts and Speech to Text, or its Projects. */
export const ConnectionTab = Schema.Literals(['Agents', 'Projects']);
export type ConnectionTab = typeof ConnectionTab.Type;

const ConnectionCard = Actor.define('ConnectionCard', {
  requires: [ConnectionCards],
  input: Schema.Struct({ connectionId: Schema.String }),
  props: Schema.Struct({
    connection: Connection,
    /** What its setup holds; null before it knows. */
    accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo)),
    speech: Schema.NullOr(SpeechToTextState),
    /** Why its Connection could not be asked. */
    problem: Schema.NullOr(Schema.String),
  }),
  model: Schema.Struct({
    connectionId: Schema.String,
    tab: ConnectionTab,
  }),
  message: Schema.TaggedUnion({
    TabChosen: { tab: ConnectionTab },
    ForgetAsked: {},
  }),
});

export const ConnectionCardLive = Actor.build(ConnectionCard, {
  init: ({ connectionId }) => ({ model: { connectionId, tab: 'Agents' } }),
  // 1. Shown
  children: {
    accounts: {
      actor: HarnessAccounts.actor,
      input: ({ model }) => ({ connectionId: model.connectionId }),
      props: ({ props }) => ({
        accounts: props.accounts,
        problem: props.problem,
      }),
    },
    speech: {
      actor: SpeechToText.actor,
      input: ({ model }) => ({ connectionId: model.connectionId }),
      props: ({ props }) => ({ speech: props.speech }),
    },
    projects: {
      actor: ConnectionProjects.actor,
      input: ({ model }) => ({ connectionId: model.connectionId }),
    },
  },
  on: {
    // 2. Tabs
    TabChosen: ({ tab }, { model }) => ({ model: { ...model, tab } }),
    // 3. Forget
    ForgetAsked: (_, { model }) => ({
      command: askForget({ id: model.connectionId }),
    }),
  },
});
