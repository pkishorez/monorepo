import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { Actor, Address, History, Snapshot } from '../index.ts';
import type { Runtime } from '../index.ts';
import type { Instance } from '../types.ts';
import { historyOf, line, scoped, seek, send } from './fixtures.ts';

// A sign-in form that tells its parent who signed in ------------------------------

const Login = Actor.define('Login', {
  model: { name: Schema.String },
  message: { Typed: { name: Schema.String }, Submitted: {}, Cancelled: {} },
  emits: { SignedIn: { user: Schema.String }, Closed: {} },
});

const LoginLive = Login.build({
  init: () => ({ model: { name: '' } }),
  on: {
    Typed: ({ name }) => ({ model: { name } }),
    Submitted: (_, { model }) => ({
      emit: { _tag: 'SignedIn', user: model.name },
    }),
    Cancelled: () => ({ emit: [{ _tag: 'Closed' }] }),
  },
});

const Gate = Actor.define('Gate', {
  model: { signIns: Schema.Number },
  state: { Anonymous: {}, Authenticated: { user: Schema.String } },
  message: { LoggedIn: { user: Schema.String }, LoggedOut: {} },
});

const GateLive = Gate.build({
  init: () => ({ model: { signIns: 0 }, state: { _tag: 'Anonymous' } }),
  states: {
    Anonymous: {
      children: {
        login: Actor.child(LoginLive, {
          emits: { SignedIn: ({ user }) => ({ _tag: 'LoggedIn', user }) },
        }),
      },
      on: {
        LoggedIn: ({ user }, { model }) => ({
          model: { signIns: model.signIns + 1 },
          state: { _tag: 'Authenticated', user },
        }),
      },
    },
    Authenticated: {
      on: { LoggedOut: () => ({ state: { _tag: 'Anonymous' } }) },
    },
  },
});

// A list whose rows each ask to be removed ----------------------------------------

const Row = Actor.define('Row', {
  message: { Removing: {} },
  emits: { Remove: {} },
}).build({ on: { Removing: () => ({ emit: { _tag: 'Remove' } }) } });

const List = Actor.define('List', {
  model: { ids: Schema.Array(Schema.String), title: Schema.String },
  message: {
    Removed: { id: Schema.String },
    Retitled: { title: Schema.String },
  },
}).build({
  init: () => ({ model: { ids: ['a', 'b'], title: '' } }),
  children: {
    rows: Actor.child(Row, {
      each: ({ model }) => model.ids,
      emits: { Remove: (_, id) => ({ _tag: 'Removed', id }) },
    }),
  },
  on: {
    Removed: ({ id }, { model }) => ({
      model: { ids: model.ids.filter((kept) => kept !== id) },
    }),
    Retitled: ({ title }) => ({ model: { title } }),
  },
});

// Three levels, each telling the one above; the Leaf starts a Worker too ---------

const Leaf = Actor.define('Leaf', {
  model: { on: Schema.Boolean },
  message: { Go: {}, Echoed: {} },
  emits: { First: {}, Second: {} },
}).build({
  init: () => ({ model: { on: false } }),
  on: {
    Go: () => ({
      model: { on: true },
      emit: [{ _tag: 'First' }, { _tag: 'Second' }],
    }),
    Echoed: () => ({}),
  },
  workers: {
    // Sends as it starts, while `Go` is being played: it waits its turn.
    echo: {
      while: ({ model }) => model.on,
      run: (self) =>
        self.send({ _tag: 'Echoed' }).pipe(Effect.andThen(Effect.never)),
    },
  },
});

const Middle = Actor.define('Middle', {
  message: { HeardFirst: {}, HeardSecond: {} },
  emits: { Up: {} },
}).build({
  children: {
    leaf: Actor.child(Leaf, {
      emits: {
        First: () => ({ _tag: 'HeardFirst' }),
        Second: () => ({ _tag: 'HeardSecond' }),
      },
    }),
  },
  on: {
    HeardFirst: () => ({ emit: { _tag: 'Up' } }),
    HeardSecond: () => ({}),
  },
});

const Top = Actor.define('Top', {
  message: { Upped: {} },
}).build({
  children: {
    middle: Actor.child(Middle, { emits: { Up: () => ({ _tag: 'Upped' }) } }),
  },
  on: { Upped: () => ({}) },
});

const LOGIN = Address.check(GateLive, 'Gate/Anonymous:login#1')!;

const at = (app: Runtime<any>, address: string): Instance | undefined =>
  Snapshot.at(app.snapshot, address as Address);

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())),
  );

describe('Emits', () => {
  it("become the parent's Message, handled before `send` returns", () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(GateLive);
        send(app, LOGIN, { _tag: 'Typed', name: 'ada' });
        send(app, LOGIN, { _tag: 'Submitted' });
        expect(app.snapshot.root.state).toEqual({
          _tag: 'Authenticated',
          user: 'ada',
        });
        expect(app.snapshot.root.model).toEqual({ signIns: 1 });
        // The Child left with the State it was Invoked in.
        expect(at(app, LOGIN)).toBeUndefined();
      }),
    ));

  it('are in the History as the parent’s Message, Sent by the Child', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(GateLive);
        send(app, LOGIN, { _tag: 'Submitted' });
        const [submitted, loggedIn] = line(app);
        expect(submitted!.message).toEqual({ _tag: 'Submitted' });
        expect(loggedIn!.to).toBe('Gate');
        expect(loggedIn!.message).toEqual({ _tag: 'LoggedIn', user: '' });
        expect(loggedIn!.from).toEqual({
          kind: 'emit',
          instance: LOGIN,
          name: 'SignedIn',
        });
        // Replay hears nothing twice: the parent's Message is its own entry.
        expect(History.snapshot(GateLive, historyOf(app))).toEqual(
          app.snapshot,
        );
        // The Child's story: there from the start, Sent one Message, and
        // gone with the parent's.
        expect(
          line(app)
            .filter((entry) => entry.to === LOGIN)
            .map((entry) => entry.message._tag),
        ).toEqual(['Submitted']);
        expect(Snapshot.at(seek(app, null), LOGIN)).toBeDefined();
        expect(Snapshot.at(seek(app, submitted!.id), LOGIN)).toBeDefined();
        expect(Snapshot.at(seek(app, loggedIn!.id), LOGIN)).toBeUndefined();
      }),
    ));

  it('a slot does not turn is not heard', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(GateLive);
        send(app, LOGIN, { _tag: 'Cancelled' });
        expect(line(app)).toHaveLength(1);
        expect(app.snapshot.root.state._tag).toBe('Anonymous');
      }),
    ));

  it('are handed the key of the Child of `each` that Emitted them', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        send(app, 'List/rows[a]#1', { _tag: 'Removing' });
        expect(app.snapshot.root.model).toEqual({ ids: ['b'], title: '' });
        expect(at(app, 'List/rows[a]#1')).toBeUndefined();
      }),
    ));

  it('are played before a Message already waiting, so the Child’s entry is followed by its parent’s', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(Middle);
        send(app, 'Middle/leaf#1', { _tag: 'Go' });
        expect(line(app).map(({ to, message }) => [to, message._tag])).toEqual([
          ['Middle/leaf#1', 'Go'],
          ['Middle', 'HeardFirst'],
          ['Middle', 'HeardSecond'],
          // The Worker's, Sent while `Go` was played, comes after.
          ['Middle/leaf#1', 'Echoed'],
        ]);
      }),
    ));

  it('are played depth first: each Emit’s own Emits before the next one', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(Top);
        send(app, 'Top/middle#1/leaf#1', { _tag: 'Go' });
        expect(line(app).map(({ to, message }) => [to, message._tag])).toEqual([
          ['Top/middle#1/leaf#1', 'Go'],
          ['Top/middle#1', 'HeardFirst'],
          ['Top', 'Upped'],
          ['Top/middle#1', 'HeardSecond'],
          ['Top/middle#1/leaf#1', 'Echoed'],
        ]);
        expect(
          line(app)
            .slice(1, 4)
            .map(({ from }) => from.kind),
        ).toEqual(['emit', 'emit', 'emit']);
        // The Chain happens at one Time, and Times only grow along the line.
        const times = line(app).map(({ at }) => at);
        expect(times.slice(1, 4)).toEqual([times[0], times[0], times[0]]);
        expect(times).toEqual([...times].sort((a, b) => a - b));
      }),
    ));

  it('are checked against their Schema', () => {
    const Bad = Login.build({
      init: () => ({ model: { name: '' } }),
      on: { Submitted: () => ({ emit: { _tag: 'SignedIn' } as never }) },
    });
    const first = Snapshot.init(Bad);
    expect(() =>
      Snapshot.next(Bad, first, {
        to: first.root.address,
        message: { _tag: 'Submitted' },
        from: { kind: 'outside' },
        at: 0,
      }),
    ).toThrow(/Emitted/);
  });
});

describe('An Update', () => {
  it('gives only the fields of the Model that change', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        send(app, 'List', { _tag: 'Retitled', title: 'Mine' });
        expect(app.snapshot.root.model).toEqual({
          ids: ['a', 'b'],
          title: 'Mine',
        });
      }),
    ));

  it('keeps the same Model while no field it gives changes', () =>
    run(
      Effect.gen(function* () {
        const app = yield* scoped(List);
        send(app, 'List', { _tag: 'Retitled', title: 'Mine' });
        const before = app.snapshot.root;
        send(app, 'List', { _tag: 'Retitled', title: 'Mine' });
        expect(app.snapshot.root).toBe(before);
        // The second Message was played all the same.
        expect(line(app)).toHaveLength(2);
      }),
    ));
});

describe('Actor.define', () => {
  it('makes the Schemas from fields and cases', () => {
    const { schemas } = GateLive.definition;
    expect(Schema.isSchema(schemas.model)).toBe(true);
    expect(
      Schema.is(schemas.state!)({ _tag: 'Authenticated', user: 'a' }),
    ).toBe(true);
    expect(Schema.is(schemas.message!)({ _tag: 'LoggedOut' })).toBe(true);
    expect(GateLive.definition.states).toEqual(['Anonymous', 'Authenticated']);
  });

  it('refuses the State blocks under `state`', () => {
    expect(() =>
      Gate.build({
        init: () => ({ model: { signIns: 0 }, state: { _tag: 'Anonymous' } }),
        state: {},
      } as never),
    ).toThrow(/`states`/);
  });
});

// Types ---------------------------------------------------------------------------

export const types = () => {
  Actor.define('NotAStruct', {
    // @ts-expect-error the Model must be a struct
    model: Schema.Number,
  });
  Gate.build({
    init: () => ({ model: { signIns: 0 }, state: { _tag: 'Anonymous' } }),
    on: {
      // @ts-expect-error a field the Model does not have
      LoggedOut: () => ({ model: { signOuts: 1 } }),
    },
  });
  Gate.build({
    init: () => ({ model: { signIns: 0 }, state: { _tag: 'Anonymous' } }),
    children: {
      login: Actor.child(LoginLive, {
        emits: {
          // The event is typed by the Child, the Message by the parent.
          SignedIn: ({ user }) => ({ _tag: 'LoggedIn', user }),
          // @ts-expect-error the parent has no such Message
          Closed: () => ({ _tag: 'Closed' }),
        },
      }),
    },
  });
  Login.build({
    init: () => ({ model: { name: '' } }),
    on: {
      // @ts-expect-error Login Emits no `Gone`
      Submitted: () => ({ emit: { _tag: 'Gone' } }),
    },
  });
};
