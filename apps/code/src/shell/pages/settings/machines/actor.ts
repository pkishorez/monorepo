import { Effect, Schema, Stream } from 'effect';
import { Machine } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Machines } from '../../../../layer/capabilities/index.ts';
import { HarnessBinaries } from './harness-binaries/index.ts';
import { SpeechToText } from './speech-to-text/index.ts';
import { ask, keepForgetting } from './commands.ts';

/*
 * Settings → Machines: the signed-in Account's Machines, from Cloud
 * Connect alone, so the list never waits for a Machine: each with when it
 * was last seen, how its tunnel stands, and its own settings, which load
 * from the Machine itself, each on its own.
 *
 * 1. Read    what `Machines` holds, followed; one child per Machine for
 *            each of its settings: its Harness Binaries, and its Speech
 *            to Text switch.
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
  machines: Schema.NullOr(Schema.Array(Machine)),
  fetchedAt: Schema.NullOr(Schema.Number),
  forgetting: Forgetting,
});
const sameKnown = Schema.toEquivalence(Known);

export const MachineSettings = Actor.define('MachineSettings', {
  requires: [Machines],
  model: Schema.Struct({
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
    Refresh: {},
  }),
});

export const MachineSettingsLive = Actor.build(MachineSettings, {
  init: () => ({
    model: { machines: null, fetchedAt: null, forgetting: null, asking: null },
  }),
  children: {
    binaries: {
      actor: HarnessBinaries.actor,
      each: ({ model }) => (model.machines ?? []).map(({ id }) => id),
      input: (_, machineId) => ({ machineId }),
    },
    speech: {
      actor: SpeechToText.actor,
      each: ({ model }) => (model.machines ?? []).map(({ id }) => id),
      input: (_, machineId) => ({ machineId }),
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
            Stream.map(({ machines, fetchedAt, forgetting }) => ({
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
    Refresh: () => ({ command: ask({ forget: null }) }),
  },
});
