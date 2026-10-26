import { Effect, Schema, Stream, SubscriptionRef } from 'effect';
import {
  CloudClient,
  CodeClients,
  Machine,
  SpeechToTextState,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import {
  AccountReplicas,
  DeviceState,
  Link,
  nobody,
  SavedDrafts,
  SavedMachines,
} from '../../../layer/capabilities/index.ts';
import { list, speechOn } from './api.ts';
import { drop, forget, keep, save } from './commands.ts';

/*
 * The Machine List: the Machines of one Account, a Child of the root page for as long as
 * that Account is signed in: the list, and a line to each Machine on it.
 *
 * 1. Saved    the list last kept for the Account shows first, so the app
 *             opens on its Machines even while Cloud Connect is out of reach;
 *             once read, kept or not, it says so.
 * 2. Fetch    then Cloud Connect's list, once, and again on Reload; each
 *             answer is kept for next time. The first answer keeps only
 *             the records of the Machines on it: a Machine gone from it
 *             takes its records here with it. Later answers delete
 *             nothing, so an answer older than another tab's never stops
 *             an Instance that tab reads, and a list that failed deletes
 *             nothing either.
 * 3. Lines    one socket per listed Machine, followed, and its Speech to
 *             Text, watched over it.
 * 4. Recheck  while a listed Machine's line is not up, Cloud Connect is asked
 *             again: every few seconds for the first minute, then every
 *             half a minute, so one on its way, whose tunnel is opening,
 *             shows up as soon as it can be reached. Once every line is up
 *             it stops; a line that drops starts it again.
 * 5. Forget   a Machine, asked from Settings: Cloud Connect forgets it, it
 *             leaves the list, so nothing reads its Instance any more, and
 *             then its records here go, and no other's: another tab
 *             may list a Machine this one has not heard of yet.
 * 6. Share    what it holds is what `Machines` says to every Actor, and
 *             what they ask through it comes here.
 */

/** How long to wait before asking Cloud Connect again, while a line is not up. */
export const RECHECK = { fast: 3_000, slow: 30_000, fastFor: 20 } as const;

const Line = Schema.Literals(['connecting', 'connected', 'reconnecting']);

const Model = Schema.Struct({
  accountId: Schema.String,
  machines: Schema.NullOr(Schema.Array(Machine)),
  /** Whether the list kept on this device has been read, kept or not. */
  savedRead: Schema.Boolean,
  fetchedAt: Schema.NullOr(Schema.Number),
  fetching: Schema.Boolean,
  problem: Schema.NullOr(Schema.String),
  forgetting: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      problem: Schema.NullOr(Schema.String),
    }),
  ),
  /** Each listed Machine's line, by id. */
  lines: Schema.Record(Schema.String, Line),
  /** Each listed Machine's Speech to Text, by id, once it has said. */
  speech: Schema.Record(Schema.String, SpeechToTextState),
  /** How many times Cloud Connect was asked again since every line was last up. */
  rechecks: Schema.Finite,
});
type Model = typeof Model.Type;

export const MachineList = Actor.define('MachineList', {
  requires: [
    CloudClient,
    SavedMachines,
    DeviceState,
    SavedDrafts,
    AccountReplicas,
    Link,
    CodeClients,
  ],
  input: Schema.Struct({ accountId: Schema.String }),
  props: Schema.Struct({
    /** The Account's email, for the command that adds a Machine. */
    email: Schema.NullOr(Schema.String),
  }),
  model: Model,
  message: Schema.TaggedUnion({
    Saved: { machines: Schema.NullOr(Schema.Array(Machine)) },
    Fetched: { machines: Schema.Array(Machine), at: Schema.Number },
    Failed: { problem: Schema.String },
    ReloadAsked: {},
    RecheckDue: {},
    LineChanged: { machineId: Schema.String, line: Line },
    SpeechWatched: { machineId: Schema.String, state: SpeechToTextState },
    ForgetAsked: { id: Schema.String },
    Forgot: { id: Schema.String },
    ForgetFailed: { id: Schema.String, problem: Schema.String },
    ForgetDismissed: {},
  }),
});

const idsOf = (model: Model) => (model.machines ?? []).map(({ id }) => id);

/** Whether a listed Machine's line is not up, so Cloud Connect is asked again. */
export const anyDown = (model: Model) =>
  idsOf(model).some((id) => model.lines[id] !== 'connected');

const delayOf = (rechecks: number) =>
  rechecks < RECHECK.fastFor ? RECHECK.fast : RECHECK.slow;

export const MachineListLive = Actor.build(MachineList, {
  init: ({ accountId }) => ({
    model: {
      accountId,
      machines: null,
      savedRead: false,
      fetchedAt: null,
      fetching: true,
      problem: null,
      forgetting: null,
      lines: {},
      speech: {},
      rechecks: 0,
    },
  }),
  workers: {
    // 1. Saved
    saved: {
      while: ({ model }) => !model.savedRead,
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const machines = yield* (yield* SavedMachines).read(model.accountId);
          yield* self.send({ _tag: 'Saved', machines });
        }),
    },
    // 2. Fetch
    fetch: {
      while: ({ model }) => model.fetching,
      run: (self) => Effect.flatMap(list, self.send),
    },
    // 3. Lines
    lines: {
      each: ({ model }) => idsOf(model),
      run: (self, machineId) =>
        Stream.runForEach(CodeClients.connection(machineId), (line) =>
          self.send({ _tag: 'LineChanged', machineId, line }),
        ),
    },
    speech: {
      each: ({ model }) => idsOf(model),
      run: (self, machineId) =>
        Stream.runForEach(speechOn(machineId), (state) =>
          self.send({ _tag: 'SpeechWatched', machineId, state }),
        ),
    },
    // 4. Recheck
    recheck: {
      while: ({ model }) => !model.fetching && anyDown(model),
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) =>
          Effect.sleep(delayOf(model.rechecks)).pipe(
            Effect.andThen(self.send({ _tag: 'RecheckDue' })),
          ),
        ),
    },
    // 6. Share
    publish: {
      run: (self) =>
        Effect.flatMap(Link, ({ known }) =>
          self.changes.pipe(
            Stream.map(({ model }) => ({
              accountId: model.accountId,
              machines: model.machines,
              savedRead: model.savedRead,
              fetchedAt: model.fetchedAt,
              problem: model.problem,
              forgetting: model.forgetting,
              lines: model.lines,
              speech: model.speech,
            })),
            Stream.changes,
            Stream.runForEach((now) => SubscriptionRef.set(known, now)),
            // Signed out: nobody's Machines are known.
            Effect.ensuring(SubscriptionRef.set(known, nobody)),
          ),
        ),
    },
    requests: {
      run: (self) =>
        Effect.flatMap(Link, ({ asked }) =>
          Stream.runForEach(Stream.fromQueue(asked), self.send),
        ),
    },
  },
  on: {
    Saved: ({ machines }, { model }) => ({
      model: {
        ...model,
        savedRead: true,
        machines: model.machines ?? machines,
      },
    }),
    Fetched: ({ machines, at }, { model }) => ({
      model: {
        ...model,
        machines,
        fetchedAt: at,
        fetching: false,
        problem: null,
      },
      command: [
        save({ accountId: model.accountId, machines }),
        ...(model.fetchedAt === null
          ? [
              keep({
                accountId: model.accountId,
                machineIds: machines.map(({ id }) => id),
              }),
            ]
          : []),
      ],
    }),
    Failed: ({ problem }, { model }) => ({
      model: { ...model, fetching: false, problem },
    }),
    // Reload: asked at once, and quickly again while a line is not up.
    ReloadAsked: (_, { model }) => ({
      model: { ...model, fetching: true, rechecks: 0 },
    }),
    RecheckDue: (_, { model }) => ({
      model: { ...model, fetching: true, rechecks: model.rechecks + 1 },
    }),
    LineChanged: ({ machineId, line }, { model }) => {
      const next = { ...model, lines: { ...model.lines, [machineId]: line } };
      return { model: anyDown(next) ? next : { ...next, rechecks: 0 } };
    },
    SpeechWatched: ({ machineId, state }, { model }) => ({
      model: { ...model, speech: { ...model.speech, [machineId]: state } },
    }),
    // 5. Forget
    ForgetAsked: ({ id }, { model }) =>
      model.forgetting !== null && model.forgetting.problem === null
        ? {}
        : {
            model: { ...model, forgetting: { id, problem: null } },
            command: forget({ id }),
          },
    // Out of the list first, so no Query reads its Instance as it goes.
    Forgot: ({ id }, { model }) => {
      const machines = (model.machines ?? []).filter((each) => each.id !== id);
      return {
        model: { ...model, machines, forgetting: null },
        command: [
          save({ accountId: model.accountId, machines }),
          drop({ accountId: model.accountId, id }),
        ],
      };
    },
    ForgetFailed: ({ id, problem }, { model }) =>
      model.forgetting?.id === id
        ? { model: { ...model, forgetting: { id, problem } } }
        : {},
    ForgetDismissed: (_, { model }) => ({
      model: { ...model, forgetting: null },
    }),
  },
});
