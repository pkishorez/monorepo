import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { Replay } from '../history/replay.ts';
import { init } from '../snapshot/engine/index.ts';
import { Actor, History, Runtime } from '../index.ts';
import type { Running } from '../runtime/index.ts';
import { Snapshot } from '../snapshot/index.ts';
import type { Instance } from '../snapshot/index.ts';

// A sign-in form that tells its parent who signed in ------------------------------

const Login = Actor.define('Login', {
  model: { name: Schema.String },
  message: { Typed: { name: Schema.String }, Submitted: {}, Cancelled: {} },
  emits: { SignedIn: { user: Schema.String }, Closed: {} },
});

const LoginLive = Actor.build(Login, {
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

const GateLive = Actor.build(Gate, {
  init: () => ({ model: { signIns: 0 }, state: { _tag: 'Anonymous' } }),
  states: {
    Anonymous: {
      children: (child) => ({
        login: child(LoginLive, {
          emits: { SignedIn: ({ user }) => ({ _tag: 'LoggedIn', user }) },
        }),
      }),
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

const Row = Actor.build(
  Actor.define('Row', {
    message: { Removing: {} },
    emits: { Remove: {} },
  }),
  { on: { Removing: () => ({ emit: { _tag: 'Remove' } }) } },
);

const List = Actor.build(
  Actor.define('List', {
    model: { ids: Schema.Array(Schema.String), title: Schema.String },
    message: {
      Removed: { id: Schema.String },
      Retitled: { title: Schema.String },
    },
  }),
  {
    init: () => ({ model: { ids: ['a', 'b'], title: '' } }),
    children: (child) => ({
      rows: child(Row, {
        each: ({ model }) => model.ids,
        emits: { Remove: (_, id) => ({ _tag: 'Removed', id }) },
      }),
    }),
    on: {
      Removed: ({ id }, { model }) => ({
        model: { ids: model.ids.filter((kept) => kept !== id) },
      }),
      Retitled: ({ title }) => ({ model: { title } }),
    },
  },
);

const LOGIN = 'Gate/login#1';

const at = (app: Running<unknown>, id: string): Instance | undefined =>
  Snapshot.instanceAt(app.snapshot(), id);

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())),
  );

describe('Emits', () => {
  it("become the parent's Message, handled before `send` returns", () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(GateLive));
        app.send(LOGIN, { _tag: 'Typed', name: 'ada' });
        app.send(LOGIN, { _tag: 'Submitted' });
        expect(app.snapshot().state).toEqual({
          _tag: 'Authenticated',
          user: 'ada',
        });
        expect(app.snapshot().model).toEqual({ signIns: 1 });
        // The Child left with the State it was Invoked in.
        expect(at(app, LOGIN)).toBeUndefined();
      }),
    ));

  it('are in the History as the parent’s Message, Sent by the Child', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(GateLive));
        app.send(LOGIN, { _tag: 'Submitted' });
        const [submitted, loggedIn] = app.history.branch();
        expect(submitted!.message).toEqual({ _tag: 'Submitted' });
        expect(loggedIn!.destination).toBe('Gate');
        expect(loggedIn!.message).toEqual({ _tag: 'LoggedIn', user: '' });
        expect(loggedIn!.source).toEqual({
          kind: 'emit',
          instance: LOGIN,
          name: 'SignedIn',
        });
        // Replay hears nothing twice: the parent's Message is its own entry.
        expect(Replay.fold(GateLive.definition, app.history.branch())).toEqual(
          app.snapshot(),
        );
      }),
    ));

  it('a slot does not turn is not heard', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(GateLive));
        app.send(LOGIN, { _tag: 'Cancelled' });
        expect(app.history.branch()).toHaveLength(1);
        expect(app.snapshot().state._tag).toBe('Anonymous');
      }),
    ));

  it('are handed the key of the Child of `each` that Emitted them', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(List));
        app.send('List/rows[a]#1', { _tag: 'Removing' });
        expect(app.snapshot().model).toEqual({ ids: ['b'], title: '' });
        expect(at(app, 'List/rows[a]#1')).toBeUndefined();
      }),
    ));

  it('are checked against their Schema', () => {
    const Bad = Actor.build(Login, {
      init: () => ({ model: { name: '' } }),
      on: { Submitted: () => ({ emit: { _tag: 'SignedIn' } as never }) },
    });
    expect(() =>
      Snapshot.handle(Bad.definition, init(Bad.definition), {
        destination: 'Login',
        message: { _tag: 'Submitted' },
        source: { kind: 'outside' },
        at: 0,
      }),
    ).toThrow(/Emitted/);
  });
});

describe('An Update', () => {
  it('gives only the fields of the Model that change', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(List));
        app.send('List', { _tag: 'Retitled', title: 'Mine' });
        expect(app.snapshot().model).toEqual({
          ids: ['a', 'b'],
          title: 'Mine',
        });
      }),
    ));

  it('keeps the same Model while no field it gives changes', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(List));
        app.send('List', { _tag: 'Retitled', title: 'Mine' });
        const before = app.snapshot();
        app.send('List', { _tag: 'Retitled', title: 'Mine' });
        expect(app.snapshot()).toBe(before);
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
      Actor.build(Gate, {
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
  Actor.build(Gate, {
    init: () => ({ model: { signIns: 0 }, state: { _tag: 'Anonymous' } }),
    on: {
      // @ts-expect-error a field the Model does not have
      LoggedOut: () => ({ model: { signOuts: 1 } }),
    },
  });
  Actor.build(Gate, {
    init: () => ({ model: { signIns: 0 }, state: { _tag: 'Anonymous' } }),
    children: (child) => ({
      login: child(LoginLive, {
        emits: {
          // The event is typed by the Child, the Message by the parent.
          SignedIn: ({ user }) => ({ _tag: 'LoggedIn', user }),
          // @ts-expect-error the parent has no such Message
          Closed: () => ({ _tag: 'Closed' }),
        },
      }),
    }),
  });
  Actor.build(Login, {
    init: () => ({ model: { name: '' } }),
    on: {
      // @ts-expect-error Login Emits no `Gone`
      Submitted: () => ({ emit: { _tag: 'Gone' } }),
    },
  });
};
