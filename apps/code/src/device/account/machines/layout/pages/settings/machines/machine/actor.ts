import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import {
  HarnessAccountInfo,
  Machine,
  SpeechToTextState,
} from '@kestack/connect/code';
import { MachineCards } from '../store.ts';
import { HarnessAccounts } from './accounts/index.ts';
import { MachineProjects } from './projects/index.ts';
import { SpeechToText } from './speech/index.ts';
import { askForget } from './commands.ts';

/*
 * One Machine in Settings → Machines: its card, standing as the sidebar
 * says it, and its own settings, as its Machine's setup holds them, handed
 * in by the list.
 *
 * 1. Shown   its Harness Accounts (`accounts/`) and its Speech to Text
 *            switch (`speech/`), each handed what its setup holds, and its
 *            Projects (`projects/`).
 * 2. Tabs    its Agents, the first two, or its Projects, as its tabs
 *            chose, Agents until then.
 * 3. Forget  asked of the list (`MachineCards`), which asks first.
 */

/** A Machine's tab: its agents' accounts and Speech to Text, or its Projects. */
export const MachineTab = Schema.Literals(['Agents', 'Projects']);
export type MachineTab = typeof MachineTab.Type;

const MachineCard = Actor.define('MachineCard', {
  requires: [MachineCards],
  input: Schema.Struct({ machineId: Schema.String }),
  props: Schema.Struct({
    machine: Machine,
    /** What its setup holds; null before it knows. */
    accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo)),
    speech: Schema.NullOr(SpeechToTextState),
    /** Why its Machine could not be asked. */
    problem: Schema.NullOr(Schema.String),
  }),
  model: Schema.Struct({
    machineId: Schema.String,
    tab: MachineTab,
  }),
  message: Schema.TaggedUnion({
    TabChosen: { tab: MachineTab },
    ForgetAsked: {},
  }),
});

export const MachineCardLive = Actor.build(MachineCard, {
  init: ({ machineId }) => ({ model: { machineId, tab: 'Agents' } }),
  // 1. Shown
  children: {
    accounts: {
      actor: HarnessAccounts.actor,
      input: ({ model }) => ({ machineId: model.machineId }),
      props: ({ props }) => ({
        accounts: props.accounts,
        problem: props.problem,
      }),
    },
    speech: {
      actor: SpeechToText.actor,
      input: ({ model }) => ({ machineId: model.machineId }),
      props: ({ props }) => ({ speech: props.speech }),
    },
    projects: {
      actor: MachineProjects.actor,
      input: ({ model }) => ({ machineId: model.machineId }),
    },
  },
  on: {
    // 2. Tabs
    TabChosen: ({ tab }, { model }) => ({ model: { ...model, tab } }),
    // 3. Forget
    ForgetAsked: (_, { model }) => ({
      command: askForget({ id: model.machineId }),
    }),
  },
});
