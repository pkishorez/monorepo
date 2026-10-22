import { Effect, Queue, Schema, Stream, SubscriptionRef } from 'effect';
import { Machine } from '@kestack/ai-toolkit/machines';
import { MachinesClient } from '@kestack/ai-toolkit/machines/client';
import { Actor } from '@kestack/kabuki';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import { Store } from '@kestack/std-toolkit/replica';
import { home, root } from '../../places/index.ts';
import { forget, list, save } from './api.ts';
import { choose, HEARTBEAT } from './health.ts';
import { Link, nobody } from './link.ts';
import { Saved } from './saved.ts';

/*
 * The Machine List: the Machines of one Account, a Child of the root page
 * for as long as that Account is signed in.
 *
 * 1. Saved    the list last kept for the Account shows first, so the app
 *             opens on its Machine even while the Backend is out of reach.
 * 2. Fetch    then the Backend's list, again every 15 seconds while the
 *             page is visible, on becoming visible, and when asked; each
 *             answer is kept for next time.
 * 3. Open     at the root, once there is a list, the Machine this device
 *             was last on for the Account, else the one seen last.
 * 4. Forget   a Machine, asked from Settings: the Backend forgets it, then
 *             its records here go; the Machine open goes back to the root.
 * 5. Share    what it holds is what `Machines` says to every page.
 */

/**
 * The root's own place, `/`: on no Machine yet. The Machine List opens
 * one from here; the root draws the list's View while it does.
 */
export const Open = Page.define({ path: '/', metadata: { title: 'code' } });

export const OpenLive = Page.build(Open);

export const MachineList = Actor.define('MachineList', {
  requires: [MachinesClient, Saved, Store, Link, Navigation],
  input: Schema.Struct({ accountId: Schema.String }),
  props: Schema.Struct({
    /** Whether the app is at the root, on no Machine. */
    atRoot: Schema.Boolean,
    /** The Machine this device was last on for the Account. */
    last: Schema.NullOr(Schema.String),
    /** The Machine the app is on. */
    on: Schema.NullOr(Schema.String),
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
    Open: { machineId: Schema.String },
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
    // 3. Open, once per Machine chosen while at the root.
    open: {
      each: ({ model, props }) => {
        if (!props.atRoot || model.machines === null) return [];
        const chosen = choose(model.machines, props.last);
        return chosen === null ? [] : [chosen.id];
      },
      run: (self, machineId) => self.send({ _tag: 'Open', machineId }),
    },
    // 5. Share
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
    Open: ({ machineId }, { props }) =>
      props.atRoot ? { command: Router.replace(home(machineId)) } : {},
    // 4. Forget
    Forget: ({ id }, { model }) =>
      model.forgetting !== null && model.forgetting.problem === null
        ? {}
        : {
            model: { ...model, forgetting: { id, problem: null } },
            command: forget({ id }),
          },
    Forgot: ({ id }, { model, props }) => {
      const machines = (model.machines ?? []).filter((each) => each.id !== id);
      return {
        model: { ...model, machines, forgetting: null },
        command: [
          save({ accountId: model.accountId, machines }),
          ...(props.on === id ? [Router.replace(root())] : []),
        ],
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
// is Provided, what a Machine's record says, where this device keeps each
// Account's list, and what signing out deletes.
export { signedOut } from './api.ts';
export { DOWN_AFTER, health, socketUrl, tunnelOf } from './health.ts';
export { Machines } from './link.ts';
export { idb as savedIdb, memory as savedMemory, Saved } from './saved.ts';
