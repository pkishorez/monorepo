import { Effect, Schema, Stream } from 'effect';
import { Machine } from '@kestack/ai-toolkit/machines';
import { Actor, Command } from '@kestack/kabuki';
import { Machines } from '../../../machines/index.ts';

/*
 * Settings → Machines: the signed-in Account's Machines, each with when it
 * was last seen and how its tunnel stands.
 *
 * 1. Read    what `Machines` holds, followed.
 * 2. Ask     Forget asks first, saying when the Machine was last seen and
 *            how its tunnel stands.
 * 3. Forget  confirmed, the Machine List forgets it: the Backend first,
 *            then its records on this device. Once it is gone from the
 *            list the question closes; refused, it says why.
 */

const Forgetting = Schema.NullOr(
  Schema.Struct({ id: Schema.String, problem: Schema.NullOr(Schema.String) }),
);

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
    Known: {
      machines: Schema.NullOr(Schema.Array(Machine)),
      fetchedAt: Schema.NullOr(Schema.Number),
      forgetting: Forgetting,
    },
    Ask: { id: Schema.String },
    Keep: {},
    Forget: {},
    Refresh: {},
  }),
});

const ask = Command.make('AskMachines', {
  args: Schema.Struct({ forget: Schema.NullOr(Schema.String) }),
  run: ({ forget }) =>
    Effect.flatMap(Machines, (machines) =>
      forget === null ? machines.refresh : machines.forget(forget),
    ),
});

const keepForgetting = Command.make('KeepForgetting', {
  run: () => Effect.flatMap(Machines, (machines) => machines.keepForgetting),
});

export const MachineSettingsLive = Actor.build(MachineSettings, {
  init: () => ({
    model: { machines: null, fetchedAt: null, forgetting: null, asking: null },
  }),
  workers: {
    // 1. Read
    known: {
      run: (self) =>
        Effect.flatMap(Machines, ({ state }) =>
          Stream.runForEach(state, ({ machines, fetchedAt, forgetting }) =>
            self.send({ _tag: 'Known', machines, fetchedAt, forgetting }),
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
