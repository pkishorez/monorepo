import { Effect, Schema, Stream, SubscriptionRef } from 'effect';
import { CloudClient, CodeClients, Machine } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import {
  AccountReplicas,
  Copy,
  copying,
  DeviceState,
  Kept,
  Link,
  nobody,
  SavedDrafts,
} from '../../../layer/capabilities/index.ts';
import { list } from './api.ts';
import {
  dropForgotten,
  dropUnlisted,
  forget,
  keepList,
  ListShelf,
} from './commands.ts';
import { Kit } from './kit/index.ts';

/*
 * The Machine List: the Machines of one Account, a Child of the root page for as long as
 * that Account is signed in: the list, a line to each Machine on it, and
 * each one's Kit.
 *
 * 1. Kept     the list last kept for the Account shows first, so the app
 *             opens on its Machines even while Cloud Connect is out of reach;
 *             once read, kept or not, it says so.
 * 2. Fetch    then Cloud Connect's list, once, and again on Reload; each
 *             answer is kept for next time. The first answer keeps only
 *             the records of the Machines on it: a Machine gone from it
 *             takes its records, Kit and Unseen marks here with it, but
 *             never its Saved Drafts, since a list may come short. Later
 *             answers delete nothing, so an answer older than another
 *             tab's never stops an Instance that tab reads, and a list
 *             that failed deletes nothing either.
 * 3. Lines    one socket per listed Machine, followed, and one Machine Kit
 *             each (kit/), which keeps what the app knows of it.
 * 4. Recheck  while a listed Machine's line is not up, Cloud Connect is asked
 *             again: every few seconds for the first minute, then every
 *             half a minute, so one on its way, whose tunnel is opening,
 *             shows up as soon as it can be reached. Once every line is up
 *             it stops; a line that drops starts it again.
 * 5. Forget   a Machine, asked from Settings: Cloud Connect forgets it, it
 *             leaves the list, so nothing reads its Instance any more, and
 *             an answer asked before never brings it back; then its
 *             records here go, and no other's: another tab may list a
 *             Machine this one has not heard of yet.
 * 6. Share    what it holds is what `Machines` says to every Actor, and
 *             what they ask through it comes here.
 */

/** How long to wait before asking Cloud Connect again, while a line is not up. */
export const RECHECK = { fast: 3_000, slow: 30_000, fastFor: 20 } as const;

const Line = Schema.Literals(['connecting', 'connected', 'reconnecting']);

const Model = Schema.Struct({
  accountId: Schema.String,
  /** The list: kept on this device, or as Cloud Connect said it. */
  list: Copy(Schema.Array(Machine)),
  fetchedAt: Schema.NullOr(Schema.Number),
  forgetting: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      problem: Schema.NullOr(Schema.String),
    }),
  ),
  /** Each listed Machine's line, by id. */
  lines: Schema.Record(Schema.String, Line),
  /** How many times Cloud Connect was asked again since every line was last up. */
  rechecks: Schema.Finite,
});
type Model = typeof Model.Type;

export const MachineList = Actor.define('MachineList', {
  requires: [
    CloudClient,
    Kept,
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
    KeptRead: { machines: Schema.NullOr(Schema.Array(Machine)) },
    Fetched: {
      since: Schema.Finite,
      machines: Schema.Array(Machine),
      at: Schema.Number,
    },
    Failed: { since: Schema.Finite, problem: Schema.String },
    ReloadAsked: {},
    RecheckDue: {},
    LineChanged: { machineId: Schema.String, line: Line },
    ForgetAsked: { id: Schema.String },
    Forgot: { id: Schema.String },
    ForgetFailed: { id: Schema.String, problem: Schema.String },
    ForgetDismissed: {},
  }),
});

const idsOf = (model: Model) => (model.list.value ?? []).map(({ id }) => id);

/** Whether Cloud Connect is being asked. */
export const fetching = (model: Model) => copying.asking(model.list).length > 0;

/** Whether a listed Machine's line is not up, so Cloud Connect is asked again. */
export const anyDown = (model: Model) =>
  idsOf(model).some((id) => model.lines[id] !== 'connected');

const delayOf = (rechecks: number) =>
  rechecks < RECHECK.fastFor ? RECHECK.fast : RECHECK.slow;

export const MachineListLive = Actor.build(MachineList, {
  init: ({ accountId }) => ({
    model: {
      accountId,
      list: copying.empty,
      fetchedAt: null,
      forgetting: null,
      lines: {},
      rechecks: 0,
    },
  }),
  workers: {
    // 1. Kept
    kept: {
      while: ({ model }) => !model.list.keptRead,
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const machines = yield* (yield* Kept).read(ListShelf, {
            accountId: model.accountId,
            machineId: null,
            projectId: null,
          });
          yield* self.send({ _tag: 'KeptRead', machines });
        }),
    },
    // 2. Fetch
    fetch: {
      each: ({ model }) => copying.asking(model.list),
      run: (self, since) => Effect.flatMap(list(Number(since)), self.send),
    },
    // 3. Lines
    lines: {
      each: ({ model }) => idsOf(model),
      run: (self, machineId) =>
        Stream.runForEach(CodeClients.connection(machineId), (line) =>
          self.send({ _tag: 'LineChanged', machineId, line }),
        ),
    },
    // 4. Recheck
    recheck: {
      while: ({ model }) => !fetching(model) && anyDown(model),
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
              machines: model.list.value,
              savedRead: model.list.keptRead,
              fetchedAt: model.fetchedAt,
              problem: model.list.problem,
              forgetting: model.forgetting,
              lines: model.lines,
            })),
            Stream.changes,
            // Its Kits share their own beside it.
            Stream.runForEach((listed) =>
              SubscriptionRef.update(known, (now) => ({ ...now, ...listed })),
            ),
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
  // 3. Lines: each listed Machine's Kit.
  children: {
    kits: {
      actor: Kit.actor,
      each: ({ model }) => idsOf(model),
      input: ({ model }, machineId) => ({
        accountId: model.accountId,
        machineId,
      }),
    },
  },
  on: {
    KeptRead: ({ machines }, { model }) => ({
      model: { ...model, list: copying.read(model.list, machines) },
    }),
    // An answer asked before a later ask, or a Forget, is dropped.
    Fetched: ({ since, machines, at }, { model }) =>
      !copying.latest(model.list, since)
        ? {}
        : {
            model: {
              ...model,
              list: copying.answered(model.list, since, machines),
              fetchedAt: at,
            },
            command: [
              keepList({ accountId: model.accountId, machines }),
              ...(model.fetchedAt === null
                ? [
                    dropUnlisted({
                      accountId: model.accountId,
                      machineIds: machines.map(({ id }) => id),
                    }),
                  ]
                : []),
            ],
          },
    Failed: ({ since, problem }, { model }) => ({
      model: { ...model, list: copying.refused(model.list, since, problem) },
    }),
    // Reload: asked at once, and quickly again while a line is not up.
    ReloadAsked: (_, { model }) => ({
      model: { ...model, list: copying.ask(model.list), rechecks: 0 },
    }),
    RecheckDue: (_, { model }) => ({
      model: {
        ...model,
        list: copying.ask(model.list),
        rechecks: model.rechecks + 1,
      },
    }),
    LineChanged: ({ machineId, line }, { model }) => {
      const next = { ...model, lines: { ...model.lines, [machineId]: line } };
      return { model: anyDown(next) ? next : { ...next, rechecks: 0 } };
    },
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
      const machines = (model.list.value ?? []).filter(
        (each) => each.id !== id,
      );
      return {
        model: {
          ...model,
          list: copying.changed(model.list, machines),
          forgetting: null,
        },
        command: [
          keepList({ accountId: model.accountId, machines }),
          dropForgotten({ accountId: model.accountId, id }),
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
