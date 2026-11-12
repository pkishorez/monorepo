import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { Actor, Address, Runtime, Snapshot } from '../index.ts';
import type { Instance } from '../index.ts';
import { line, to } from './fixtures.ts';

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
        const app = yield* Runtime.scoped(GateLive);
        app.send(LOGIN, { _tag: 'Typed', name: 'ada' });
        app.send(LOGIN, { _tag: 'Submitted' });
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
        const app = yield* Runtime.scoped(GateLive);
        app.send(LOGIN, { _tag: 'Submitted' });
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
        expect(Snapshot.replay(GateLive, app.history)).toBe(app.snapshot);
        expect(
          Snapshot.trail(GateLive, app.history, LOGIN).map(({ kind }) => kind),
        ).toEqual(['started', 'received', 'stopped']);
      }),
    ));

  it('a slot does not turn is not heard', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(GateLive);
        app.send(LOGIN, { _tag: 'Cancelled' });
        expect(line(app)).toHaveLength(1);
        expect(app.snapshot.root.state._tag).toBe('Anonymous');
      }),
    ));

  it('are handed the key of the Child of `each` that Emitted them', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(List);
        app.send(to(app, 'List/rows[a]#1'), { _tag: 'Removing' });
        expect(app.snapshot.root.model).toEqual({ ids: ['b'], title: '' });
        expect(at(app, 'List/rows[a]#1')).toBeUndefined();
      }),
    ));

  it('are checked against their Schema', () => {
    const Bad = Login.build({
      init: () => ({ model: { name: '' } }),
      on: { Submitted: () => ({ emit: { _tag: 'SignedIn' } as never }) },
    });
    const first = Snapshot.init(Bad);
    expect(() =>
      Snapshot.play(Bad, first, {
        id: 0,
        parent: null,
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
        const app = yield* Runtime.scoped(List);
        app.send(to(app, 'List'), { _tag: 'Retitled', title: 'Mine' });
        expect(app.snapshot.root.model).toEqual({
          ids: ['a', 'b'],
          title: 'Mine',
        });
      }),
    ));

  it('keeps the same Model while no field it gives changes', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(List);
        app.send(to(app, 'List'), { _tag: 'Retitled', title: 'Mine' });
        const before = app.snapshot.root;
        app.send(to(app, 'List'), { _tag: 'Retitled', title: 'Mine' });
        expect(app.snapshot.root).toBe(before);
        expect(app.snapshot.entry).toBe(1);
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
