import { Effect, Queue, Schema, Stream, SubscriptionRef } from 'effect';
import { Machine } from '@kestack/ai-toolkit/machines';
import { MachinesClient } from '@kestack/ai-toolkit/machines/client';
import { Actor } from '@kestack/kabuki';
import { Store } from '@kestack/std-toolkit/replica';
import { drop, forget, list, save } from './api.ts';
import { HEARTBEAT } from './health.ts';
import { Link, nobody } from './link.ts';
import { Saved } from './saved.ts';

/*
 * The Machine List: the Machines of one Account, a Child of the root page
 * for as long as that Account is signed in.
 *
 * 1. Saved    the list last kept for the Account shows first, so the app
 *             opens on its Machines even while the Backend is out of reach.
 * 2. Fetch    then the Backend's list, again every 15 seconds while the
 *             page is visible, on becoming visible, and when asked; each
 *             answer is kept for next time.
 * 3. Forget   a Machine, asked from Settings: the Backend forgets it, it
 *             leaves the list, so nothing reads its Instance any more, and
 *             then its records here go.
 * 4. Share    what it holds is what `Machines` says to every page.
 */

export const MachineList = Actor.define('MachineList', {
  requires: [MachinesClient, Saved, Store, Link],
  input: Schema.Struct({ accountId: Schema.String }),
  props: Schema.Struct({
    /** The Account's email, for the command that adds a Machine. */
    email: Schema.NullOr(Schema.String),
  }),
  model: Schema.Struct({
    accountId: Schema.String,
    machines: Schema.NullOr(Schema.Array(Machine)),
    fetchedAt: Schema.NullOr(Schema.Number),
    fetching: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
    visible: Schema.Boolean,
    forgetting: Schema.NullOr(
      Schema.Struct({
        id: Schema.String,
        problem: Schema.NullOr(Schema.String),
      }),
    ),
  }),
  message: Schema.TaggedUnion({
    Saved: { machines: Schema.Array(Machine) },
    Fetched: { machines: Schema.Array(Machine), at: Schema.Number },
    Failed: { problem: Schema.String },
    Refresh: {},
    Visible: { visible: Schema.Boolean },
    Forget: { id: Schema.String },
    Forgot: { id: Schema.String },
    ForgetFailed: { id: Schema.String, problem: Schema.String },
    KeepForgetting: {},
  }),
});

const isVisible = () =>
  typeof document === 'undefined' || document.visibilityState !== 'hidden';

const visibility = Stream.callback<boolean>((queue) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const heard = () => Queue.offerUnsafe(queue, isVisible());
      if (typeof document !== 'undefined')
        document.addEventListener('visibilitychange', heard);
      return heard;
    }),
    (heard) =>
      Effect.sync(() => {
        if (typeof document !== 'undefined')
          document.removeEventListener('visibilitychange', heard);
      }),
  ),
);

export const MachineListLive = Actor.build(MachineList, {
  init: ({ accountId }) => ({
    model: {
      accountId,
      machines: null,
      fetchedAt: null,
      fetching: true,
      problem: null,
      visible: isVisible(),
      forgetting: null,
    },
  }),
  workers: {
    // 1. Saved
    saved: {
      while: ({ model }) => model.machines === null,
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const machines = yield* (yield* Saved).read(model.accountId);
          if (machines !== null) yield* self.send({ _tag: 'Saved', machines });
        }),
    },
    // 2. Fetch
    fetch: {
      while: ({ model }) => model.fetching,
      run: (self) => Effect.flatMap(list, self.send),
    },
    // Again every Heartbeat while visible.
    poll: {
      while: ({ model }) => model.visible && !model.fetching,
      run: (self) =>
        Effect.sleep(HEARTBEAT).pipe(
          Effect.andThen(self.send({ _tag: 'Refresh' })),
        ),
    },
    visibility: {
      run: (self) =>
        Stream.runForEach(visibility, (visible) =>
          self.send({ _tag: 'Visible', visible }),
        ),
    },
    // 4. Share
    publish: {
      run: (self) =>
        Effect.flatMap(Link, ({ known }) =>
          self.changes.pipe(
            Stream.map(({ model }) => ({
              accountId: model.accountId,
              machines: model.machines,
              fetchedAt: model.fetchedAt,
              problem: model.problem,
              forgetting: model.forgetting,
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
    Saved: ({ machines }, { model }) =>
      model.machines === null ? { model: { ...model, machines } } : {},
    Fetched: ({ machines, at }, { model }) => ({
      model: {
        ...model,
        machines,
        fetchedAt: at,
        fetching: false,
        problem: null,
      },
      command: save({ accountId: model.accountId, machines }),
    }),
    Failed: ({ problem }, { model }) => ({
      model: { ...model, fetching: false, problem },
    }),
    Refresh: (_, { model }) => ({ model: { ...model, fetching: true } }),
    // Visible again: asked at once.
    Visible: ({ visible }, { model }) => ({
      model: {
        ...model,
        visible,
        fetching: model.fetching || (visible && !model.visible),
      },
    }),
    // 3. Forget
    Forget: ({ id }, { model }) =>
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
        command: [save({ accountId: model.accountId, machines }), drop({ id })],
      };
    },
    ForgetFailed: ({ id, problem }, { model }) =>
      model.forgetting?.id === id
        ? { model: { ...model, forgetting: { id, problem } } }
        : {},
    KeepForgetting: (_, { model }) => ({
      model: { ...model, forgetting: null },
    }),
  },
});

// What the rest of the app reads of Machines: the Capability every page
// is Provided, how every Machine of it is reached, what a Machine's record
// says, where this device keeps each Account's list, and what signing out
// deletes.
export { signedOut } from './api.ts';
export {
  DOWN_AFTER,
  health,
  outOfReach,
  socketUrl,
  statusOf,
} from './health.ts';
export { Machines } from './link.ts';
export { reach } from './reach.ts';
export { idb as savedIdb, memory as savedMemory, Saved } from './saved.ts';
