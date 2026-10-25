import { Effect, Schema, Stream } from 'effect';
import { Machine } from '@kestack/connect/code';
import { Page } from '@kestack/kabuki/routing';
import { Machines } from '../../../../layer/capabilities/index.ts';
import { HarnessAccounts } from './harness-accounts/index.ts';
import { SpeechToText } from './speech-to-text/index.ts';
import { ask, keepForgetting } from './commands.ts';

/*
 * Settings → Machines, `/settings/machines`: the signed-in Account's
 * Machines as the Machine List holds them, so the list never waits for a
 * Machine, each standing as the sidebar says it, by its Line and Last
 * Seen; and each Machine's own settings, shown as last kept on this device
 * and asked of the Machine behind, each on its own.
 *
 * 1. Read    what `Machines` holds, followed; one child per Machine for
 *            each of its settings, its Harness Accounts and its Speech to
 *            Text switch, each told whose Machine it is. Reload asks the
 *            Machine List again, as the sidebar's does.
 * 2. Ask     Forget asks first, saying when the Machine was last seen and
 *            how its tunnel stands.
 * 3. Forget  confirmed, the Machine List forgets it: Cloud Connect first,
 *            then its records on this device. Once it is gone from the
 *            list the question closes; refused, it says why.
 */

const Forgetting = Schema.NullOr(
  Schema.Struct({ id: Schema.String, problem: Schema.NullOr(Schema.String) }),
);

/** What it follows of `Machines`. */
const Known = Schema.Struct({
  accountId: Schema.NullOr(Schema.String),
  machines: Schema.NullOr(Schema.Array(Machine)),
  fetchedAt: Schema.NullOr(Schema.Number),
  forgetting: Forgetting,
});
const sameKnown = Schema.toEquivalence(Known);

export const MachineSettings = Page.define({
  path: '/machines',
  metadata: { title: 'Machines · Settings · code' },
  requires: [Machines],
  model: Schema.Struct({
    /** Whether `Machines` has said anything yet. */
    heard: Schema.Boolean,
    accountId: Schema.NullOr(Schema.String),
    machines: Schema.NullOr(Schema.Array(Machine)),
    fetchedAt: Schema.NullOr(Schema.Number),
    forgetting: Forgetting,
    /** The Machine Forget is asking about. */
    asking: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Known: Known.fields,
    Ask: { id: Schema.String },
    Keep: {},
    Forget: {},
    Reload: {},
  }),
});

export const MachineSettingsLive = Page.build(MachineSettings, {
  init: () => ({
    model: {
      heard: false,
      accountId: null,
      machines: null,
      fetchedAt: null,
      forgetting: null,
      asking: null,
    },
  }),
  children: {
    accounts: {
      actor: HarnessAccounts.actor,
      each: ({ model }) => (model.machines ?? []).map(({ id }) => id),
      input: (_, machineId) => ({ machineId }),
    },
    speech: {
      actor: SpeechToText.actor,
      each: ({ model }) => (model.machines ?? []).map(({ id }) => id),
      input: ({ model }, machineId) => ({
        machineId,
        accountId: model.accountId ?? '',
      }),
    },
  },
  workers: {
    // 1. Read
    known: {
      run: (self) =>
        // The list and Forget only, so a line or a download changes
        // nothing here: each Machine's own settings follow those.
        Effect.flatMap(Machines, ({ state }) =>
          state.pipe(
            Stream.map(({ accountId, machines, fetchedAt, forgetting }) => ({
              accountId,
              machines,
              fetchedAt,
              forgetting,
            })),
            Stream.changesWith(sameKnown),
            Stream.runForEach((known) =>
              self.send({ _tag: 'Known', ...known }),
            ),
          ),
        ),
    },
  },
  on: {
    Known: (known, { model }) => ({
      model: {
        ...model,
        ...known,
        heard: true,
        // 3. Gone from the list: nothing left to ask about.
        asking:
          model.asking !== null &&
          known.machines?.some(({ id }) => id === model.asking) === true
            ? model.asking
            : null,
      },
    }),
    // 2. Ask
    Ask: ({ id }, { model }) =>
      model.forgetting !== null && model.forgetting.problem === null
        ? {}
        : {
            model: { ...model, asking: id },
            ...(model.forgetting === null ? {} : { command: keepForgetting() }),
          },
    Keep: (_, { model }) =>
      model.forgetting !== null && model.forgetting.problem === null
        ? {}
        : {
            model: { ...model, asking: null },
            ...(model.forgetting === null ? {} : { command: keepForgetting() }),
          },
    // 3. Forget
    Forget: (_, { model }) =>
      model.asking === null ? {} : { command: ask({ forget: model.asking }) },
    Reload: () => ({ command: ask({ forget: null }) }),
  },
});
