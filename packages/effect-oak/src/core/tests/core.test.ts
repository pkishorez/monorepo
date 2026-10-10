import {
  Context,
  Effect,
  Layer,
  Schema,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { Actor, Replay, Runtime, instanceAt } from '../index.ts';
import type { Instance, Running } from '../index.ts';

class Server extends Context.Service<
  Server,
  { readonly checkSession: Effect.Effect<string | undefined> }
>()('test/Server') {}

class SignIn extends Context.Service<
  SignIn,
  { readonly complete: (user: string) => Effect.Effect<void> }
>()('test/SignIn') {}

class Session extends Context.Service<
  Session,
  {
    readonly user: SubscriptionRef.SubscriptionRef<string>;
    readonly logOut: Effect.Effect<void>;
  }
>()('test/Session') {}

const Login = Actor.make('Login', {
  requires: { signIn: SignIn },
  model: Schema.Struct({ name: Schema.String, typedAt: Schema.Number }),
  message: Schema.TaggedUnion({
    Typed: { name: Schema.String },
    Submitted: {},
  }),
}).build({
  init: () => ({ model: { name: '', typedAt: 0 } }),
  update: {
    Typed: (message, { at }) => ({
      model: { name: message.name, typedAt: at },
    }),
    Submitted: (_, { model }) => ({
      command: Effect.gen(function* () {
        yield* (yield* SignIn).complete(model.name);
      }),
    }),
  },
});

const Todos = Actor.make('Todos', {
  requires: { session: Session },
  model: Schema.Struct({ items: Schema.Array(Schema.String) }),
  message: Schema.TaggedUnion({ Added: { text: Schema.String }, Quit: {} }),
}).build({
  init: () => ({ model: { items: [] } }),
  update: {
    Added: (message, { model }) => ({
      model: { items: [...model.items, message.text] },
    }),
    Quit: () => ({
      command: Effect.gen(function* () {
        yield* (yield* Session).logOut;
      }),
    }),
  },
});

const AuthState = Schema.TaggedUnion({
  Checking: {},
  Anonymous: {},
  Authenticated: { user: Schema.String },
});

const Auth = Actor.make('Auth', {
  requires: { server: Server },
  state: AuthState,
  provides: { Anonymous: [SignIn], Authenticated: [Session] },
  children: { Anonymous: { login: Login }, Authenticated: { todos: Todos } },
  message: Schema.TaggedUnion({
    CheckedSession: { user: Schema.optional(Schema.String) },
    LoggedIn: { user: Schema.String },
    Renamed: { user: Schema.String },
    LoggedOut: {},
  }),
}).build({
  init: () => ({ state: { _tag: 'Checking' } }),
  update: {
    Checking: {
      CheckedSession: ({ user }) => ({
        state: user ? { _tag: 'Authenticated', user } : { _tag: 'Anonymous' },
      }),
    },
    Anonymous: {
      LoggedIn: ({ user }) => ({ state: { _tag: 'Authenticated', user } }),
    },
    Authenticated: {
      Renamed: ({ user }) => ({ state: { _tag: 'Authenticated', user } }),
      LoggedOut: () => ({ state: { _tag: 'Anonymous' } }),
    },
  },
  lifetime: {
    Checking: (self) =>
      Effect.gen(function* () {
        const user = yield* (yield* Server).checkSession;
        yield* self.send({ _tag: 'CheckedSession', user });
      }),
  },
  provides: {
    Anonymous: (self) =>
      Layer.succeed(SignIn, {
        complete: (user) => self.send({ _tag: 'LoggedIn', user }),
      }),
    Authenticated: (self) =>
      Layer.effect(
        Session,
        Effect.gen(function* () {
          built.push((yield* self.get).state.user);
          const user = yield* SubscriptionRef.make(
            (yield* self.get).state.user,
          );
          // The Capability follows the Model itself, without being built again.
          yield* self.changes.pipe(
            Stream.runForEach(({ state }) =>
              SubscriptionRef.set(user, state.user),
            ),
            Effect.forkScoped,
          );
          return { user, logOut: self.send({ _tag: 'LoggedOut' }) };
        }),
      ),
  },
});

/** Every user a Session was built for: once per entry into Authenticated. */
const built: Array<string> = [];

const ServerLive = Layer.succeed(Server, {
  checkSession: Effect.succeed(undefined),
});

/** Let forked work run. */
const settle = Effect.gen(function* () {
  for (let i = 0; i < 10; i++) yield* Effect.yieldNow;
});

const at = (app: Running<unknown>, id: string): Instance => {
  const instance = instanceAt(app.snapshot(), id);
  expect(instance, id).toBeDefined();
  return instance!;
};

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const timed = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())),
  );

const started = Runtime.start(Auth).pipe(Effect.provide(ServerLive));

describe('a tree of Actors', () => {
  it('moves through States, Invoking and stopping Children', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        expect(app.snapshot().state._tag).toBe('Anonymous');
        expect(Object.keys(app.snapshot().children)).toEqual(['login']);

        app.send('Auth/login#1', { _tag: 'Typed', name: 'ada' });
        app.send('Auth/login#1', { _tag: 'Submitted' });
        yield* settle;
        expect(app.snapshot().state).toEqual({
          _tag: 'Authenticated',
          user: 'ada',
        });

        app.send('Auth/todos#1', { _tag: 'Added', text: 'write tests' });
        expect(at(app, 'Auth/todos#1').model).toEqual({
          items: ['write tests'],
        });

        app.send('Auth/todos#1', { _tag: 'Quit' });
        yield* settle;
        expect(app.snapshot().state._tag).toBe('Anonymous');
        app.send('Auth/todos#1', { _tag: 'Added', text: 'too late' });

        expect(
          app
            .log()
            .map(
              (e) =>
                `${e.instance} ${e.message._tag} ${e.outcome} ${e.from}→${e.to}`,
            ),
        ).toEqual([
          'Auth CheckedSession handled Checking→Anonymous',
          'Auth/login#1 Typed handled Single→Single',
          'Auth/login#1 Submitted handled Single→Single',
          'Auth LoggedIn handled Anonymous→Authenticated',
          'Auth/todos#1 Added handled Single→Single',
          'Auth/todos#1 Quit handled Single→Single',
          'Auth LoggedOut handled Authenticated→Anonymous',
          'Auth/todos#1 Added dropped →',
        ]);
        // Invoked again, login gets a new ID.
        expect(Object.values(app.snapshot().children)).toMatchObject([
          { id: 'Auth/login#2' },
        ]);
      }),
    ));

  it('ignores a Message the current State has no rule for', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        app.send('Auth', { _tag: 'LoggedOut' });
        expect(app.log().at(-1)?.outcome).toBe('ignored');
      }),
    ));

  it('keeps every Instance off the changed path the same object', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Board);
        const before = app.snapshot();
        app.send('Board/left#1', { _tag: 'Bumped' });
        const after = app.snapshot();
        expect(after).not.toBe(before);
        expect(after.children['right']).toBe(before.children['right']);
        expect(after.children['left']).not.toBe(before.children['left']);
      }),
    ));
});

const Counter = Actor.make('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({ Bumped: {} }),
}).build({
  init: () => ({ model: { count: 0 } }),
  update: { Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }) },
});

const Board = Actor.make('Board', {
  children: { left: Counter, right: Counter },
}).build({});

describe('keyed Children', () => {
  const Row = Actor.make('Row', {
    input: Schema.Struct({ text: Schema.String }),
    model: Schema.Struct({ text: Schema.String, done: Schema.Boolean }),
    message: Schema.TaggedUnion({ Toggled: {} }),
  }).build({
    init: ({ text }) => ({ model: { text, done: false } }),
    update: {
      Toggled: (_, { model }) => ({ model: { ...model, done: !model.done } }),
    },
  });

  const List = Actor.make('List', {
    model: Schema.Struct({
      ids: Schema.Array(Schema.String),
      next: Schema.Number,
    }),
    message: Schema.TaggedUnion({
      Added: { text: Schema.String },
      Removed: { id: Schema.String },
      Reversed: {},
    }),
    children: { rows: Actor.many(Row) },
  }).build({
    init: () => ({ model: { ids: [], next: 0 } }),
    invoke: ({ model }) => ({
      rows: model.ids.map((id) => ({ key: id, input: { text: `#${id}` } })),
    }),
    update: {
      Added: (_, { model }) => ({
        model: { ids: [...model.ids, `${model.next}`], next: model.next + 1 },
      }),
      Removed: ({ id }, { model }) => ({
        model: { ...model, ids: model.ids.filter((kept) => kept !== id) },
      }),
      Reversed: (_, { model }) => ({
        model: { ...model, ids: [...model.ids].reverse() },
      }),
    },
  });

  const rows = (app: Running<unknown>) =>
    app.snapshot().children['rows'] as ReadonlyArray<Instance>;

  it('follow the Model by key, each starting from its Input', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(List);
        app.send('List', { _tag: 'Added', text: '' });
        app.send('List', { _tag: 'Added', text: '' });
        expect(rows(app).map((row) => [row.id, row.model])).toEqual([
          ['List/rows[0]#1', { text: '#0', done: false }],
          ['List/rows[1]#1', { text: '#1', done: false }],
        ]);

        app.send('List/rows[1]#1', { _tag: 'Toggled' });
        const toggled = rows(app)[1];
        app.send('List', { _tag: 'Reversed' });
        expect(rows(app).map((row) => row.key)).toEqual(['1', '0']);
        expect(rows(app)[0]).toBe(toggled);
      }),
    ));

  it('a key Invoked again is a new Instance', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(List);
        app.send('List', { _tag: 'Added', text: '' });
        app.send('List/rows[0]#1', { _tag: 'Toggled' });
        app.send('List', { _tag: 'Removed', id: '0' });
        expect(rows(app)).toEqual([]);
        app.send('List/rows[0]#1', { _tag: 'Toggled' });
        expect(app.log().at(-1)?.outcome).toBe('dropped');
      }),
    ));

  it('a State with keyed Children must say what it Invokes', () => {
    const Forgot = Actor.make('Forgot', {
      children: { rows: Actor.many(Row) },
      // @ts-expect-error invoke is missing
    }).build({});
    expect(Forgot).toBeDefined();
  });
});

describe('Time', () => {
  it('stamps each Message with when it was sent, and hands it to Update', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        yield* TestClock.adjust('250 millis');
        app.send('Auth/login#1', { _tag: 'Typed', name: 'ada' });

        expect(app.now()).toBe(250);
        expect(app.log().map((e) => e.at)).toEqual([0, 250]);
        expect(at(app, 'Auth/login#1').model).toMatchObject({ typedAt: 250 });
      }),
    ));
});

/** What work did, seen from outside. */
const heard: Array<string> = [];

/** Commands: one that rings after a second, keyed; one that streams. */
const Timer = Actor.make('Timer', {
  model: Schema.Struct({ chunks: Schema.Array(Schema.Number) }),
  message: Schema.TaggedUnion({
    Wait: {},
    Cancel: {},
    Rang: {},
    Stream: {},
    Chunk: { n: Schema.Number },
  }),
}).build({
  init: () => ({ model: { chunks: [] } }),
  update: {
    Wait: () => ({
      command: {
        key: 'ring',
        run: Effect.sleep('1 second').pipe(
          Effect.as({ _tag: 'Rang' as const }),
        ),
      },
    }),
    Cancel: () => ({ cancel: 'ring' }),
    Rang: () => ({}),
    Stream: () => ({
      command: (self) =>
        Effect.forEach(
          [1, 2, 3],
          (n) =>
            Effect.sleep('10 millis').pipe(
              Effect.andThen(self.send({ _tag: 'Chunk', n })),
            ),
          { discard: true },
        ),
    }),
    Chunk: ({ n }, { model }) => ({ model: { chunks: [...model.chunks, n] } }),
  },
});

describe('Commands', () => {
  it("sleep on Effect's Clock, and end with a Message stamped when it arrives", () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Timer);
        app.send('Timer', { _tag: 'Wait' });
        yield* TestClock.adjust('999 millis');
        expect(app.log().length).toBe(1);
        yield* TestClock.adjust('1 millis');
        expect(app.log().map((e) => [e.message._tag, e.at])).toEqual([
          ['Wait', 0],
          ['Rang', 1000],
        ]);
      }),
    ));

  it('a Command started under a key replaces the one running under it', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Timer);
        app.send('Timer', { _tag: 'Wait' });
        yield* TestClock.adjust('600 millis');
        app.send('Timer', { _tag: 'Wait' });
        yield* TestClock.adjust('1 second');
        expect(app.log().map((e) => [e.message._tag, e.at])).toEqual([
          ['Wait', 0],
          ['Wait', 600],
          ['Rang', 1600],
        ]);
      }),
    ));

  it('cancel interrupts the Command under a key', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Timer);
        app.send('Timer', { _tag: 'Wait' });
        app.send('Timer', { _tag: 'Cancel' });
        yield* TestClock.adjust('2 seconds');
        expect(app.log().map((e) => e.message._tag)).toEqual([
          'Wait',
          'Cancel',
        ]);
      }),
    ));

  it('a Command can Send any number of Messages', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Timer);
        app.send('Timer', { _tag: 'Stream' });
        yield* TestClock.adjust('30 millis');
        expect(app.snapshot().model).toEqual({ chunks: [1, 2, 3] });
      }),
    ));
});

/** A Lifetime for the whole Instance, and one for while it is Running. */
const Metronome = Actor.make('Metronome', {
  state: Schema.TaggedUnion({ Running: {}, Resting: {} }),
  model: Schema.Struct({ beats: Schema.Number }),
  message: Schema.TaggedUnion({ Beat: {}, Rest: {}, Ping: {}, Pong: {} }),
}).build({
  init: () => ({ model: { beats: 0 }, state: { _tag: 'Running' } }),
  update: {
    Running: {
      Beat: (_, { model }) => ({ model: { beats: model.beats + 1 } }),
      Rest: () => ({ state: { _tag: 'Resting' } }),
    },
    '*': {
      Ping: () => ({
        command: Effect.sleep('1 second').pipe(
          Effect.tap(() => Effect.sync(() => heard.push('pong'))),
          Effect.as({ _tag: 'Pong' as const }),
        ),
      }),
      Pong: () => ({}),
    },
  },
  lifetime: {
    '*': () =>
      Effect.addFinalizer(() => Effect.sync(() => heard.push('gone'))).pipe(
        Effect.andThen(Effect.never),
      ),
    Running: (self) =>
      Effect.addFinalizer(() => Effect.sync(() => heard.push('rested'))).pipe(
        Effect.andThen(
          Effect.sleep('100 millis').pipe(
            Effect.tap(() => Effect.sync(() => heard.push('beat'))),
            Effect.andThen(self.send({ _tag: 'Beat' })),
            Effect.forever,
          ),
        ),
      ),
  },
});

describe('Lifetimes', () => {
  it('run while their State lasts, and their Scope closes when it is left', () =>
    timed(
      Effect.gen(function* () {
        heard.length = 0;
        const app = yield* Runtime.start(Metronome);
        yield* TestClock.adjust('250 millis');
        app.send('Metronome', { _tag: 'Rest' });
        yield* settle;
        yield* TestClock.adjust('1 second');
        expect(heard).toEqual(['beat', 'beat', 'rested']);
        expect(app.snapshot().model).toEqual({ beats: 2 });
      }),
    ));
});

describe('Provides', () => {
  it('is built once per State, and follows the Model from inside', () =>
    run(
      Effect.gen(function* () {
        built.length = 0;
        const app = yield* started;
        yield* settle;
        app.send('Auth', { _tag: 'LoggedIn', user: 'ada' });
        yield* settle;
        app.send('Auth', { _tag: 'Renamed', user: 'grace' });
        yield* settle;
        expect(built).toEqual(['ada']);
      }),
    ));
});

describe('Replay', () => {
  it('rebuilds the Snapshot at any Step from init and Update alone', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* started;
        const later = TestClock.adjust('10 millis');
        yield* settle;
        yield* later;
        app.send('Auth/login#1', { _tag: 'Typed', name: 'ada' });
        yield* later;
        app.send('Auth/login#1', { _tag: 'Submitted' });
        yield* settle;
        yield* later;
        app.send('Auth/todos#1', { _tag: 'Added', text: 'one' });
        yield* later;
        app.send('Auth/todos#1', { _tag: 'Quit' });
        yield* settle;
        expect(app.log().length).toBe(7);

        const replay = Replay.make(Auth.definition, undefined, { every: 2 });
        const step = (n: number) => replay.seek(app.log().slice(0, n));
        expect((yield* step(0)).state._tag).toBe('Checking');
        expect(instanceAt(yield* step(2), 'Auth/login#1')?.model).toMatchObject(
          { name: 'ada' },
        );
        expect((yield* step(4)).state._tag).toBe('Authenticated');
        expect(instanceAt(yield* step(5), 'Auth/todos#1')?.model).toEqual({
          items: ['one'],
        });
        expect((yield* step(7)).state._tag).toBe('Anonymous');
        // Back again, from a saved Snapshot.
        expect(instanceAt(yield* step(4), 'Auth/todos#1')?.model).toEqual({
          items: [],
        });
        expect(yield* step(7)).toEqual(app.snapshot());
      }),
    ));
});

describe('Requires and Provides', () => {
  it('a tree needs only what no ancestor Provides', () => {
    const needs: Effect.Effect<unknown, never, Server | Scope.Scope> =
      Runtime.start(Auth);
    expect(needs).toBeDefined();
  });

  it('a Child must find what it needs in its parent Requires or Provides', () => {
    const Orphan = Actor.make('Orphan', {
      // @ts-expect-error Session: the parent neither Requires nor Provides it
      children: { todos: Todos },
    }).build({});
    const Passes = Actor.make('Passes', {
      requires: { session: Session },
      children: { todos: Todos },
    }).build({});
    expect([Orphan, Passes]).toBeDefined();
  });

  it('a Capability Provided in one State does not reach Children of another', () => {
    const Wrong = Actor.make('Wrong', {
      state: AuthState,
      provides: { Authenticated: [Session] },
      // @ts-expect-error Session is Provided only in Authenticated, but Todos lives in Anonymous
      children: { Anonymous: { todos: Todos } },
    });
    expect(Wrong).toBeDefined();
  });

  it('an Actor must build every Capability its shape says it Provides', () => {
    const Forgot = Actor.make('Forgot', {
      state: AuthState,
      provides: { Authenticated: [Session] },
    }).build(
      // @ts-expect-error provides.Authenticated is missing
      { init: () => ({ state: { _tag: 'Checking' } }) },
    );
    const Other = Actor.make('Other', {
      state: AuthState,
      provides: { Authenticated: [Session] },
    }).build({
      init: () => ({ state: { _tag: 'Checking' } }),
      provides: {
        Authenticated: () =>
          // @ts-expect-error builds SignIn, but the shape says Session
          Layer.succeed(SignIn, { complete: () => Effect.void }),
      },
    });
    expect([Forgot, Other]).toBeDefined();
  });
});

describe('the mailbox', () => {
  it('tells subscribers once the queue is empty', () =>
    run(
      Effect.gen(function* () {
        const Echo = Actor.make('Echo', {
          model: Schema.Struct({ n: Schema.Number }),
          message: Schema.TaggedUnion({ Ping: {}, Pong: {} }),
        }).build({
          init: () => ({ model: { n: 0 } }),
          lifetime: (self) =>
            self.changes.pipe(
              Stream.filter(({ model }) => model.n === 1),
              Stream.runForEach(() => self.send({ _tag: 'Pong' })),
            ),
          update: {
            Ping: (_, { model }) => ({ model: { n: model.n + 1 } }),
            Pong: (_, { model }) => ({ model: { n: model.n + 10 } }),
          },
        });
        const app = yield* Runtime.start(Echo);
        yield* settle;
        let told = 0;
        app.subscribe(() => told++);
        app.send('Echo', { _tag: 'Ping' });
        expect(told).toBe(1);
        yield* settle;
        expect(app.snapshot().model).toEqual({ n: 11 });
      }),
    ));
});

describe('the Log as a tree', () => {
  const tags = (app: Running<unknown>) => app.log().map((e) => e.message._tag);

  it('grows the Branch with each Message, after the Head', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Timer);
        app.send('Timer', { _tag: 'Rang' });
        app.send('Timer', { _tag: 'Rang' });
        expect(app.log().map((e) => [e.id, e.parent])).toEqual([
          [0, null],
          [1, 0],
        ]);
        expect(app.state().head).toBe(1);
        expect(app.children(null).map((e) => e.id)).toEqual([0]);
        expect(app.children(0).map((e) => e.id)).toEqual([1]);
      }),
    ));

  it('stop closes every Lifetime and Command, and Time stands still', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Metronome);
        yield* TestClock.adjust('250 millis');
        app.send('Metronome', { _tag: 'Ping' });
        heard.length = 0;
        yield* app.stop();
        expect(app.state().running).toBe(false);
        expect(heard).toEqual(['rested', 'gone']);

        yield* TestClock.adjust('2 seconds');
        app.send('Metronome', { _tag: 'Ping' });
        expect(tags(app)).toEqual(['Beat', 'Beat', 'Ping']);
        expect(app.now()).toBe(250);
        expect(heard).toEqual(['rested', 'gone']);
      }),
    ));

  it('start(from) grows a new Branch from an entry, and the old one stays', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Metronome);
        yield* TestClock.adjust('350 millis');
        expect(app.log().map((e) => e.at)).toEqual([100, 200, 300]);
        yield* app.stop();
        yield* TestClock.adjust('1 second');

        yield* app.start(1);
        expect(app.state()).toMatchObject({ head: 1, running: true });
        expect(app.now()).toBe(200);
        expect(app.snapshot().model).toEqual({ beats: 2 });

        yield* TestClock.adjust('100 millis');
        expect(app.log().map((e) => e.id)).toEqual([0, 1, 3]);
        expect(app.log()[2]).toMatchObject({ parent: 1, at: 300 });
        expect(app.children(1).map((e) => e.id)).toEqual([2, 3]);
        expect(app.snapshot().model).toEqual({ beats: 3 });
      }),
    ));

  it('start() resumes the Branch from where it stopped', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Metronome);
        yield* TestClock.adjust('250 millis');
        yield* app.stop();
        yield* TestClock.adjust('1 second');
        yield* app.start();
        expect(app.now()).toBe(250);
        yield* TestClock.adjust('100 millis');
        expect(app.log().map((e) => [e.id, e.parent, e.at])).toEqual([
          [0, null, 100],
          [1, 0, 200],
          [2, 1, 350],
        ]);
      }),
    ));

  it('starting while running stops first', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Metronome);
        yield* TestClock.adjust('250 millis');
        yield* app.start(null);
        expect(app.now()).toBe(0);
        expect(app.snapshot().model).toEqual({ beats: 0 });
        yield* TestClock.adjust('100 millis');
        expect(app.children(null).map((e) => e.id)).toEqual([0, 2]);
      }),
    ));

  it('shows the app right after an entry on another Branch', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Metronome);
        yield* TestClock.adjust('350 millis');
        yield* app.start(0);
        yield* app.show(2);
        expect(app.state().shown).toBe(2);
        expect(app.drawn().model).toEqual({ beats: 3 });
        expect(app.snapshot().model).toEqual({ beats: 1 });
        yield* app.show(null);
        expect(app.drawn()).toBe(app.snapshot());
      }),
    ));

  it('a fork rebuilds the same Instances, with the same IDs', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        app.send('Auth', { _tag: 'LoggedIn', user: 'ada' });
        app.send('Auth/todos#1', { _tag: 'Added', text: 'one' });
        yield* app.start(0);
        expect(app.snapshot().state._tag).toBe('Anonymous');
        app.send('Auth/todos#1', { _tag: 'Added', text: 'stale' });
        expect(app.log().at(-1)?.outcome).toBe('dropped');
        yield* settle;
        app.send('Auth', { _tag: 'LoggedIn', user: 'bob' });
        expect(at(app, 'Auth/todos#1').model).toEqual({ items: [] });
      }),
    ));
});
