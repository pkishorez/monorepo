import { Context, Effect, Layer, Schema, Stream } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { Node, Replay, Runtime } from '../index.ts';

class Server extends Context.Service<
  Server,
  { readonly checkSession: Effect.Effect<string | undefined> }
>()('test/Server') {}

class SignIn extends Context.Service<
  SignIn,
  { readonly complete: (user: string) => void }
>()('test/SignIn') {}

class Session extends Context.Service<
  Session,
  { readonly user: string; readonly logOut: () => void }
>()('test/Session') {}

const Login = Node.make('Login', {
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
      commands: [
        Effect.gen(function* () {
          (yield* SignIn).complete(model.name);
        }),
      ],
    }),
  },
});

const Todos = Node.make('Todos', {
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
      commands: [
        Effect.gen(function* () {
          (yield* Session).logOut();
        }),
      ],
    }),
  },
});

const AuthState = Schema.TaggedUnion({
  Checking: {},
  Anonymous: {},
  Authenticated: { user: Schema.String },
});

const Auth = Node.make('Auth', {
  requires: { server: Server },
  state: AuthState,
  provides: { Anonymous: [SignIn], Authenticated: [Session] },
  children: { Anonymous: { login: Login }, Authenticated: { todos: Todos } },
  message: Schema.TaggedUnion({
    CheckedSession: { user: Schema.optional(Schema.String) },
    LoggedIn: { user: Schema.String },
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
    Authenticated: { LoggedOut: () => ({ state: { _tag: 'Anonymous' } }) },
  },
  lifetime: {
    Checking: () =>
      Stream.fromEffect(
        Effect.gen(function* () {
          return yield* (yield* Server).checkSession;
        }),
      ).pipe(Stream.map((user) => ({ _tag: 'CheckedSession' as const, user }))),
  },
  provides: {
    Anonymous: ({ send }) =>
      Context.make(SignIn, {
        complete: (user) => send({ _tag: 'LoggedIn', user }),
      }),
    Authenticated: ({ state, send }) =>
      Context.make(Session, {
        user: state.user,
        logOut: () => send({ _tag: 'LoggedOut' }),
      }),
  },
});

/** A Command that rings after a second; waiting again starts the second over. */
const Timer = Node.make('Timer', {
  message: Schema.TaggedUnion({ Wait: {}, Rang: {} }),
}).build({
  update: {
    Wait: () => ({
      commands: [
        Effect.sleep('1 second').pipe(Effect.as({ _tag: 'Rang' as const })),
      ],
      replaceCommands: true,
    }),
    Rang: () => ({}),
  },
});

const ServerLive = Layer.succeed(Server, {
  checkSession: Effect.succeed(undefined),
});

const inState = <
  S extends { readonly state: { readonly _tag: string } },
  T extends S['state']['_tag'],
>(
  snapshot: S,
  tag: T,
) => {
  expect(snapshot.state._tag).toBe(tag);
  return snapshot as Extract<S, { readonly state: { readonly _tag: T } }>;
};

const started = Runtime.start(Auth).pipe(Effect.provide(ServerLive));

describe('a tree of Nodes', () => {
  it('moves through States, creating and destroying Children', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { root, log } = yield* started;
          yield* Effect.yieldNow;

          const login = inState(root.current(), 'Anonymous').children.login;
          login.current().send({ _tag: 'Typed', name: 'ada' });
          login.current().send({ _tag: 'Submitted' });
          yield* Effect.yieldNow;

          const todos = inState(root.current(), 'Authenticated').children.todos;
          todos.current().send({ _tag: 'Added', text: 'write tests' });
          expect(todos.current().model.items).toEqual(['write tests']);

          todos.current().send({ _tag: 'Quit' });
          yield* Effect.yieldNow;
          expect(root.current().state._tag).toBe('Anonymous');
          todos.current().send({ _tag: 'Added', text: 'too late' });

          expect(
            log().map(
              (e) =>
                `${e.path} ${e.message._tag} ${e.outcome} ${e.from}→${e.to}`,
            ),
          ).toEqual([
            'Auth CheckedSession handled Checking→Anonymous',
            'Auth/login Typed handled Single→Single',
            'Auth/login Submitted handled Single→Single',
            'Auth LoggedIn handled Anonymous→Authenticated',
            'Auth/todos Added handled Single→Single',
            'Auth/todos Quit handled Single→Single',
            'Auth LoggedOut handled Authenticated→Anonymous',
            'Auth/todos Added dropped Single→Single',
          ]);
        }),
      ),
    ));

  it('ignores a Message the current State has no rule for', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { root, log } = yield* started;
          yield* Effect.yieldNow;
          root.current().send({ _tag: 'LoggedOut' });
          expect(log().at(-1)?.outcome).toBe('ignored');
        }),
      ),
    ));
});

describe('Time', () => {
  it('stamps each Message with when it was sent, and hands it to Update', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { root, sent, now } = yield* started;
          yield* Effect.yieldNow;
          yield* TestClock.adjust('250 millis');
          const login = inState(root.current(), 'Anonymous').children.login;
          login.current().send({ _tag: 'Typed', name: 'ada' });

          expect(now()).toBe(250);
          expect(sent().map((s) => s.at)).toEqual([0, 250]);
          expect(login.current().model.typedAt).toBe(250);
        }),
      ).pipe(Effect.provide(TestClock.layer())),
    ));
});

describe('Commands', () => {
  it("sleep on Effect's Clock, and end with a Message stamped when it arrives", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { root, log } = yield* Runtime.start(Timer);
          root.current().send({ _tag: 'Wait' });
          yield* TestClock.adjust('999 millis');
          expect(log().length).toBe(1);
          yield* TestClock.adjust('1 millis');
          expect(log().map((e) => [e.message._tag, e.at])).toEqual([
            ['Wait', 0],
            ['Rang', 1000],
          ]);
        }),
      ).pipe(Effect.provide(TestClock.layer())),
    ));

  it('an Update can replace the Commands still running', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { root, log } = yield* Runtime.start(Timer);
          root.current().send({ _tag: 'Wait' });
          yield* TestClock.adjust('600 millis');
          root.current().send({ _tag: 'Wait' });
          yield* TestClock.adjust('1 second');
          expect(log().map((e) => [e.message._tag, e.at])).toEqual([
            ['Wait', 0],
            ['Wait', 600],
            ['Rang', 1600],
          ]);
        }),
      ).pipe(Effect.provide(TestClock.layer())),
    ));
});

describe('Replay', () => {
  it('rebuilds the tree at any Step from init and Update alone', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { root, log, sent } = yield* started;
          const later = TestClock.adjust('10 millis');
          yield* Effect.yieldNow;
          const login = inState(root.current(), 'Anonymous').children.login;
          yield* later;
          login.current().send({ _tag: 'Typed', name: 'ada' });
          yield* later;
          login.current().send({ _tag: 'Submitted' });
          yield* Effect.yieldNow;
          const todos = inState(root.current(), 'Authenticated').children.todos;
          yield* later;
          todos.current().send({ _tag: 'Added', text: 'one' });
          yield* later;
          todos.current().send({ _tag: 'Quit' });
          yield* Effect.yieldNow;
          expect(log().length).toBe(7);
          expect(sent().map((s) => s.at)).toEqual([0, 10, 20, 20, 30, 40, 40]);

          const replay = Replay.make(Auth, sent);
          expect(replay.seek(0).current().state._tag).toBe('Checking');

          const step1 = inState(replay.seek(1).current(), 'Anonymous');
          expect(step1.children.login.current().model.name).toBe('');

          const step2 = inState(replay.seek(2).current(), 'Anonymous');
          expect(step2.children.login.current().model.name).toBe('ada');

          // Messages 3 and 4 share Time 20, and each is its own Step.
          expect(replay.seek(3).current().state._tag).toBe('Anonymous');
          expect(replay.seek(4).current().state._tag).toBe('Authenticated');

          const step5 = inState(replay.seek(5).current(), 'Authenticated');
          expect(step5.children.todos.current().model.items).toEqual(['one']);
          step5.children.todos
            .current()
            .send({ _tag: 'Added', text: 'ignored' });
          expect(step5.children.todos.current().model.items).toEqual(['one']);

          expect(replay.seek(7).current().state._tag).toBe('Anonymous');
          const back = inState(replay.seek(4).current(), 'Authenticated');
          expect(back.children.todos.current().model.items).toEqual([]);
          expect(root.current().state._tag).toBe('Anonymous');
        }),
      ).pipe(Effect.provide(TestClock.layer())),
    ));

  it('drops a Message for an Instance that is gone, even with a new one at its Path', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { root, log, sent } = yield* started;
          yield* Effect.yieldNow;
          root.current().send({ _tag: 'LoggedIn', user: 'ada' });
          const old = inState(root.current(), 'Authenticated').children.todos;
          root.current().send({ _tag: 'LoggedOut' });
          root.current().send({ _tag: 'LoggedIn', user: 'bob' });
          old.current().send({ _tag: 'Added', text: 'stale' });
          expect(log().at(-1)?.outcome).toBe('dropped');

          const replayed = inState(
            Replay.make(Auth, sent).seek(Infinity).current(),
            'Authenticated',
          );
          expect(replayed.state.user).toBe('bob');
          expect(replayed.children.todos.current().model.items).toEqual([]);
        }),
      ),
    ));
});

describe('Requires and Provides', () => {
  it('a tree needs only what no ancestor Provides', () => {
    const needs: Effect.Effect<unknown, never, Server | Scope.Scope> =
      Runtime.start(Auth);
    expect(needs).toBeDefined();
  });

  it('a Child must find what it needs in its parent Requires or Provides', () => {
    const Orphan = Node.make('Orphan', {
      // @ts-expect-error Session: the parent neither Requires nor Provides it
      children: { todos: Todos },
    }).build({});
    const Passes = Node.make('Passes', {
      requires: { session: Session },
      children: { todos: Todos },
    }).build({});
    expect([Orphan, Passes]).toBeDefined();
  });

  it('a Service Provided in one State does not reach Children of another', () => {
    const Wrong = Node.make('Wrong', {
      state: AuthState,
      provides: { Authenticated: [Session] },
      // @ts-expect-error Session is Provided only in Authenticated, but Todos lives in Anonymous
      children: { Anonymous: { todos: Todos } },
    });
    expect(Wrong).toBeDefined();
  });

  it('a Node must build every Service its shape says it Provides', () => {
    const Forgot = Node.make('Forgot', {
      state: AuthState,
      provides: { Authenticated: [Session] },
    }).build(
      // @ts-expect-error provides.Authenticated is missing
      { init: () => ({ state: { _tag: 'Checking' } }) },
    );
    const Other = Node.make('Other', {
      state: AuthState,
      provides: { Authenticated: [Session] },
    }).build({
      init: () => ({ state: { _tag: 'Checking' } }),
      provides: {
        Authenticated: ({ send }) =>
          // @ts-expect-error builds SignIn, but the shape says Session
          Context.make(SignIn, { complete: () => send }),
      },
    });
    expect([Forgot, Other]).toBeDefined();
  });
});
