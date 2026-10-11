import {
  Context,
  Duration,
  Effect,
  Layer,
  Schema,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Actor, Replay, Runtime, handle, init, instanceAt } from '../index.ts';
import type { Instance, Running, Types } from '../index.ts';

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
  requires: [SignIn],
  model: Schema.Struct({ name: Schema.String, typedAt: Schema.Number }),
  message: Schema.TaggedUnion({
    Typed: { name: Schema.String },
    Submitted: {},
  }),
}).build({
  init: () => ({ model: { name: '', typedAt: 0 } }),
  on: {
    Typed: (message, { at }) => ({
      model: { name: message.name, typedAt: at },
    }),
    Submitted: (_, { model }) => ({
      command: {
        name: 'signIn',
        run: Effect.gen(function* () {
          yield* (yield* SignIn).complete(model.name);
        }),
      },
    }),
  },
});

const Todos = Actor.make('Todos', {
  requires: [Session],
  model: Schema.Struct({ items: Schema.Array(Schema.String) }),
  message: Schema.TaggedUnion({ Added: { text: Schema.String }, Quit: {} }),
}).build({
  init: () => ({ model: { items: [] } }),
  on: {
    Added: (message, { model }) => ({
      model: { items: [...model.items, message.text] },
    }),
    Quit: () => ({
      command: {
        name: 'logOut',
        run: Effect.gen(function* () {
          yield* (yield* Session).logOut;
        }),
      },
    }),
  },
});

const AuthState = Schema.TaggedUnion({
  Checking: {},
  Anonymous: {},
  Authenticated: { user: Schema.String },
});

const Auth = Actor.make('Auth', {
  requires: [Server],
  state: AuthState,
  message: Schema.TaggedUnion({
    CheckedSession: { user: Schema.optional(Schema.String) },
    LoggedIn: { user: Schema.String },
    Renamed: { user: Schema.String },
    LoggedOut: {},
  }),
}).build({
  init: () => ({ state: { _tag: 'Checking' } }),
  state: {
    Checking: {
      workers: {
        check: {
          run: (self) =>
            Effect.gen(function* () {
              const user = yield* (yield* Server).checkSession;
              yield* self.send({ _tag: 'CheckedSession', user });
            }),
        },
      },
      on: {
        CheckedSession: ({ user }) => ({
          state: user ? { _tag: 'Authenticated', user } : { _tag: 'Anonymous' },
        }),
      },
    },
    Anonymous: {
      children: { login: Login },
      provides: (self) =>
        Layer.succeed(SignIn, {
          complete: (user) => self.send({ _tag: 'LoggedIn', user }),
        }),
      on: {
        LoggedIn: ({ user }) => ({ state: { _tag: 'Authenticated', user } }),
      },
    },
    Authenticated: {
      children: { todos: Todos },
      provides: (self) =>
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
      on: {
        Renamed: ({ user }) => ({ state: { _tag: 'Authenticated', user } }),
        LoggedOut: () => ({ state: { _tag: 'Anonymous' } }),
      },
    },
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
        // A Request's Source is the Command that made it, in another Instance.
        expect(
          app
            .log()
            .map(
              (e) =>
                `${e.source.kind} ${e.source.instance}${e.source.name ? ` ${e.source.name}` : ''}`,
            ),
        ).toEqual([
          'worker Auth check',
          'view Auth/login#1',
          'view Auth/login#1',
          'command Auth/login#1 signIn',
          'view Auth/todos#1',
          'view Auth/todos#1',
          'command Auth/todos#1 logOut',
          'view Auth/todos#1',
        ]);
        // Any entry's Snapshot, played again, is the one the app had live.
        expect(app.snapshotAt(app.state().head)).toEqual(app.snapshot());
        expect(app.snapshotAt(null).state._tag).toBe('Checking');
        // Invoked again, login gets a new ID.
        expect(Object.values(app.snapshot().children)).toMatchObject([
          { id: 'Auth/login#2' },
        ]);

        // Clear forgets every Branch and goes live from init.
        yield* app.clear();
        yield* settle;
        expect(app.state().entries.map((e) => e.message._tag)).toEqual([
          'CheckedSession',
        ]);
        expect(app.snapshot().state._tag).toBe('Anonymous');
      }),
    ));

  it('names every State an Actor can be in', () => {
    expect(Auth.definition.states).toEqual([
      'Checking',
      'Anonymous',
      'Authenticated',
    ]);
    expect(Login.definition.states).toEqual(['Single']);
  });

  it('ignores a Message the current State has no rule for', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        app.send('Auth', { _tag: 'LoggedOut' });
        expect(app.log().at(-1)?.outcome).toBe('ignored');
      }),
    ));

  it('checks every Message against its Schema, and throws at the Send before anything changes', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        const before = app.snapshot();
        const entries = app.log().length;
        expect(() =>
          app.send('Auth', { _tag: 'Renamed', user: 42 as never }),
        ).toThrow(/Auth: Message "Renamed" does not match its Schema/);
        expect(() => app.send('Auth', { _tag: 'Nope' })).toThrow(
          /Auth: Message "Nope" does not match its Schema/,
        );
        expect(app.snapshot()).toBe(before);
        expect(app.log()).toHaveLength(entries);
        app.send('Auth', { _tag: 'LoggedOut' });
        expect(app.log()).toHaveLength(entries + 1);
      }),
    ));

  it('checks every Input, and the Model and State init and each Update give', () => {
    const Row = Actor.make('Row', {
      input: Schema.Struct({ text: Schema.String }),
      model: Schema.Struct({ text: Schema.String }),
    }).build({ init: ({ text }) => ({ model: { text } }) });
    const Sheet = Actor.make('Sheet', {
      model: Schema.Struct({ count: Schema.Number, row: Schema.Unknown }),
      state: Schema.TaggedUnion({ Open: {}, Shut: {} }),
      message: Schema.TaggedUnion({
        Counted: { by: Schema.Number },
        Shut: {},
      }),
    }).build({
      init: () => ({ model: { count: 0, row: 'a' }, state: { _tag: 'Open' } }),
      children: { row: Row },
      invoke: ({ model }) => ({ row: { text: model.row as string } }),
      on: {
        Counted: ({ by }, { model }) => ({
          model: { ...model, count: by > 1 ? (String(by) as never) : by },
        }),
        Shut: () => ({ state: { _tag: 'Closed' } as never }),
      },
    });
    const first = init(Sheet.definition);
    const sent = (message: Types<typeof Sheet>['message']) =>
      handle(Sheet.definition, first, {
        instance: 'Sheet',
        message,
        source: { kind: 'view', instance: 'Sheet' },
        at: 0,
      });

    expect(sent({ _tag: 'Counted', by: 1 }).outcome).toBe('handled');
    expect(() => sent({ _tag: 'Counted', by: 2 })).toThrow(
      /Sheet: the Model the Update for "Counted" in Open gave Sheet does not match its Schema\nExpected number\n {2}at \["count"\]/,
    );
    expect(() => sent({ _tag: 'Shut' })).toThrow(
      /Sheet: the State the Update for "Shut" in Open gave Sheet does not match its Schema/,
    );
    expect(() => init(Row.definition, { text: 7 })).toThrow(
      /Row: the Input of Row does not match its Schema/,
    );
    const Bad = Actor.make('Bad', {
      state: Schema.TaggedUnion({ On: {} }),
    }).build({ init: () => ({ state: { _tag: 'Off' } as never }) });
    expect(() => init(Bad.definition)).toThrow(
      /Bad: the State init gave Bad does not match its Schema/,
    );

    // Live, a bad Update changes nothing and throws at the Send.
    return run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Sheet);
        const before = app.snapshot();
        expect(() => app.send('Sheet', { _tag: 'Counted', by: 2 })).toThrow(
          /the Model the Update for "Counted"/,
        );
        expect(app.snapshot()).toBe(before);
        expect(app.log()).toHaveLength(0);
        app.send('Sheet', { _tag: 'Counted', by: 1 });
        expect(app.log()).toHaveLength(1);
      }),
    );
  });

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
  on: { Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }) },
});

const Board = Actor.make('Board', {}).build({
  children: { left: Counter, right: Counter },
});

describe('keyed Children', () => {
  const Row = Actor.make('Row', {
    input: Schema.Struct({ text: Schema.String }),
    model: Schema.Struct({ text: Schema.String, done: Schema.Boolean }),
    message: Schema.TaggedUnion({ Toggled: {} }),
  }).build({
    init: ({ text }) => ({ model: { text, done: false } }),
    on: {
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
  }).build({
    init: () => ({ model: { ids: [], next: 0 } }),
    children: { rows: Actor.many(Row) },
    invoke: ({ model }) => ({
      rows: model.ids.map((id) => ({ key: id, input: { text: `#${id}` } })),
    }),
    on: {
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
    // @ts-expect-error invoke is missing
    const Forgot = Actor.make('Forgot', {}).build({
      children: { rows: Actor.many(Row) },
    });
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

/** An errand that rings after a second. */
const ring = {
  name: 'ring',
  run: Effect.sleep('1 second').pipe(Effect.as({ _tag: 'Rang' as const })),
};

/** Commands that ring, and a Worker that streams while the Model says so. */
const Timer = Actor.make('Timer', {
  model: Schema.Struct({
    chunks: Schema.Array(Schema.Number),
    streaming: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({
    Wait: {},
    Both: {},
    Rang: {},
    Stream: {},
    Chunk: { n: Schema.Number },
    Streamed: {},
  }),
}).build({
  init: () => ({ model: { chunks: [], streaming: false } }),
  on: {
    Wait: () => ({ command: ring }),
    Both: () => ({ command: [ring, ring] }),
    Rang: () => ({}),
    Stream: (_, { model }) => ({ model: { ...model, streaming: true } }),
    Chunk: ({ n }, { model }) => ({
      model: { ...model, chunks: [...model.chunks, n] },
    }),
    Streamed: (_, { model }) => ({ model: { ...model, streaming: false } }),
  },
  workers: {
    stream: {
      while: ({ model }) => model.streaming,
      run: (self) =>
        Effect.forEach(
          [1, 2, 3],
          (n) =>
            Effect.sleep('10 millis').pipe(
              Effect.andThen(self.send({ _tag: 'Chunk', n })),
            ),
          { discard: true },
        ).pipe(Effect.andThen(self.send({ _tag: 'Streamed' }))),
    },
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
        expect(app.log()[1]!.source).toEqual({
          kind: 'command',
          instance: 'Timer',
          name: 'ring',
        });
      }),
    ));

  it('a Command whose Message does not match its Schema fails, and the Message never lands', () =>
    timed(
      Effect.gen(function* () {
        const failed = vi.spyOn(console, 'error').mockImplementation(() => {});
        const Liar = Actor.make('Liar', {
          message: Schema.TaggedUnion({
            Ask: {},
            Answered: { n: Schema.Number },
          }),
        }).build({
          on: {
            Ask: () => ({
              command: {
                name: 'answer',
                run: Effect.succeed({ _tag: 'Answered', n: 'one' } as never),
              },
            }),
            Answered: () => ({}),
          },
        });
        const app = yield* Runtime.start(Liar);
        app.send('Liar', { _tag: 'Ask' });
        yield* TestClock.adjust('1 millis');
        expect(app.log().map((entry) => entry.message._tag)).toEqual(['Ask']);
        expect(failed.mock.calls.join(' ')).toMatch(
          /Liar command answer failed[\s\S]*Message "Answered" does not match its Schema/,
        );
        failed.mockRestore();
      }),
    ));

  it('a list of Commands runs concurrently', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Timer);
        app.send('Timer', { _tag: 'Both' });
        yield* TestClock.adjust('1 second');
        expect(app.log().map((e) => [e.message._tag, e.at])).toEqual([
          ['Both', 0],
          ['Rang', 1000],
          ['Rang', 1000],
        ]);
      }),
    ));
});

/** A Worker for the whole Instance, and one for while it is Running. */
const Metronome = Actor.make('Metronome', {
  state: Schema.TaggedUnion({ Running: {}, Resting: {} }),
  model: Schema.Struct({ beats: Schema.Number }),
  message: Schema.TaggedUnion({ Beat: {}, Rest: {}, Ping: {}, Pong: {} }),
}).build({
  init: () => ({ model: { beats: 0 }, state: { _tag: 'Running' } }),
  on: {
    Ping: () => ({
      command: {
        name: 'pong',
        run: Effect.sleep('1 second').pipe(
          Effect.tap(() => Effect.sync(() => heard.push('pong'))),
          Effect.as({ _tag: 'Pong' as const }),
        ),
      },
    }),
    Pong: () => ({}),
  },
  workers: {
    alive: {
      run: () =>
        Effect.addFinalizer(() => Effect.sync(() => heard.push('gone'))).pipe(
          Effect.andThen(Effect.never),
        ),
    },
  },
  state: {
    Running: {
      on: {
        Beat: (_, { model }) => ({ model: { beats: model.beats + 1 } }),
        Rest: () => ({ state: { _tag: 'Resting' } }),
      },
      workers: {
        beat: {
          run: (self) =>
            Effect.addFinalizer(() =>
              Effect.sync(() => heard.push('rested')),
            ).pipe(
              Effect.andThen(
                Effect.sleep('100 millis').pipe(
                  Effect.tap(() => Effect.sync(() => heard.push('beat'))),
                  Effect.andThen(self.send({ _tag: 'Beat' })),
                  Effect.forever,
                ),
              ),
            ),
        },
      },
    },
  },
});

/** One Worker per upload still Uploading; each reports progress, then is done. */
const Uploads = Actor.make('Uploads', {
  model: Schema.Struct({
    uploads: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        status: Schema.Literals(['Uploading', 'Done', 'Cancelled']),
        progress: Schema.Number,
      }),
    ),
  }),
  message: Schema.TaggedUnion({
    Started: { id: Schema.String },
    Progressed: { id: Schema.String, progress: Schema.Number },
    Finished: { id: Schema.String },
    Cancelled: { id: Schema.String },
  }),
}).build({
  init: () => ({ model: { uploads: [] } }),
  on: {
    Started: ({ id }, { model }) => ({
      model: {
        uploads: [...model.uploads, { id, status: 'Uploading', progress: 0 }],
      },
    }),
    Progressed: ({ id, progress }, { model }) => ({
      model: {
        uploads: model.uploads.map((u) =>
          u.id === id ? { ...u, progress } : u,
        ),
      },
    }),
    Finished: ({ id }, { model }) => ({
      model: {
        uploads: model.uploads.map((u) =>
          u.id === id ? { ...u, status: 'Done' } : u,
        ),
      },
    }),
    Cancelled: ({ id }, { model }) => ({
      model: {
        uploads: model.uploads.map((u) =>
          u.id === id ? { ...u, status: 'Cancelled' } : u,
        ),
      },
    }),
  },
  workers: {
    upload: {
      each: ({ model }) =>
        model.uploads.filter((u) => u.status === 'Uploading').map((u) => u.id),
      run: (self, id) =>
        Effect.addFinalizer(() =>
          Effect.sync(() => heard.push(`closed ${id}`)),
        ).pipe(
          Effect.andThen(
            Effect.forEach(
              [50, 100],
              (progress) =>
                Effect.sleep('10 millis').pipe(
                  Effect.andThen(
                    self.send({ _tag: 'Progressed', id, progress }),
                  ),
                ),
              { discard: true },
            ),
          ),
          Effect.andThen(self.send({ _tag: 'Finished', id })),
        ),
    },
  },
});

/** A Worker that finishes at once, and a finalizer that breaks the rule. */
const Once = Actor.make('Once', {
  model: Schema.Struct({ on: Schema.Boolean, runs: Schema.Number }),
  message: Schema.TaggedUnion({ On: {}, Off: {}, Ran: {}, Late: {} }),
}).build({
  init: () => ({ model: { on: false, runs: 0 } }),
  on: {
    On: (_, { model }) => ({ model: { ...model, on: true } }),
    Off: (_, { model }) => ({ model: { ...model, on: false } }),
    Ran: (_, { model }) => ({ model: { ...model, runs: model.runs + 1 } }),
    Late: () => ({}),
  },
  workers: {
    once: {
      while: ({ model }) => model.on,
      run: (self) =>
        Effect.addFinalizer(() => self.send({ _tag: 'Late' })).pipe(
          Effect.andThen(self.send({ _tag: 'Ran' })),
        ),
    },
  },
});

/** A Worker that waits until a Time in the Model, however often it is started. */
const Alarm = Actor.make('Alarm', {
  model: Schema.Struct({ ringAt: Schema.NullOr(Schema.Number) }),
  message: Schema.TaggedUnion({ Set: {}, Rang: {} }),
}).build({
  init: () => ({ model: { ringAt: null } }),
  on: {
    Set: (_, { at }) => ({ model: { ringAt: at + 1000 } }),
    Rang: () => ({ model: { ringAt: null } }),
  },
  workers: {
    ring: {
      while: ({ model }) => model.ringAt !== null,
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const left = model.ringAt! - (yield* self.now);
          yield* Effect.sleep(Duration.millis(left));
          yield* self.send({ _tag: 'Rang' });
        }),
    },
  },
});

describe('Workers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('follow a yes or no in the Model, and are seen live by name', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Timer);
        expect(app.workers('Timer')).toEqual([]);
        app.send('Timer', { _tag: 'Stream' });
        expect(app.workers('Timer')).toEqual([
          { name: 'stream', key: '', status: 'running' },
        ]);
        yield* TestClock.adjust('30 millis');
        expect(app.snapshot().model).toEqual({
          chunks: [1, 2, 3],
          streaming: false,
        });
        expect(app.workers('Timer')).toEqual([]);
        expect(app.log()[1]!.source).toEqual({
          kind: 'worker',
          instance: 'Timer',
          name: 'stream',
        });
      }),
    ));

  it('run one per key, and stop when the key goes', () =>
    timed(
      Effect.gen(function* () {
        heard.length = 0;
        const app = yield* Runtime.start(Uploads);
        app.send('Uploads', { _tag: 'Started', id: 'a' });
        app.send('Uploads', { _tag: 'Started', id: 'b' });
        expect(app.workers('Uploads').map((w) => w.key)).toEqual(['a', 'b']);
        yield* TestClock.adjust('10 millis');
        app.send('Uploads', { _tag: 'Cancelled', id: 'a' });
        yield* settle;
        expect(heard).toEqual(['closed a']);
        yield* TestClock.adjust('10 millis');
        expect(app.snapshot().model).toEqual({
          uploads: [
            { id: 'a', status: 'Cancelled', progress: 50 },
            { id: 'b', status: 'Done', progress: 100 },
          ],
        });
        expect(heard).toEqual(['closed a', 'closed b']);
        expect(app.workers('Uploads')).toEqual([]);
        expect(app.log().at(-1)!.source).toEqual({
          kind: 'worker',
          instance: 'Uploads',
          name: 'upload',
          key: 'b',
        });
      }),
    ));

  it('a finished Worker stays idle until its key goes, and runs again when it is back', () =>
    run(
      Effect.gen(function* () {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = yield* Runtime.start(Once);
        app.send('Once', { _tag: 'On' });
        yield* settle;
        expect(app.snapshot().model).toEqual({ on: true, runs: 1 });
        expect(app.workers('Once')).toEqual([
          { name: 'once', key: '', status: 'finished' },
        ]);
        app.send('Once', { _tag: 'Off' });
        app.send('Once', { _tag: 'On' });
        yield* settle;
        expect(app.snapshot().model).toEqual({ on: true, runs: 2 });
      }),
    ));

  it('read the Time, so a wait until a Time in the Model survives a stop and a fork', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Alarm);
        app.send('Alarm', { _tag: 'Set' });
        yield* TestClock.adjust('600 millis');
        yield* app.stop();
        // The Clock runs on while stopped; Time does not.
        yield* TestClock.adjust('5 seconds');
        yield* app.start();
        expect(app.now()).toBe(600);
        yield* TestClock.adjust('399 millis');
        expect(app.log().map((e) => e.message._tag)).toEqual(['Set']);
        yield* TestClock.adjust('1 millis');
        expect(app.log().map((e) => [e.message._tag, e.at])).toEqual([
          ['Set', 0],
          ['Rang', 1000],
        ]);
        // A fork from the entry that set it waits the whole second again, from its Time.
        yield* app.start(0);
        yield* TestClock.adjust('1 second');
        expect(app.log().map((e) => [e.message._tag, e.at])).toEqual([
          ['Set', 0],
          ['Rang', 1000],
        ]);
        expect(app.state().entries.length).toBe(3);
      }),
    ));

  it('a Send from a finalizer dies loudly and never lands', () =>
    run(
      Effect.gen(function* () {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = yield* Runtime.start(Once);
        app.send('Once', { _tag: 'On' });
        yield* settle;
        expect(app.log().map((e) => e.message._tag)).toEqual(['On', 'Ran']);
        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0]![0]).toMatch(
          /Worker once of Once sent a Message after it stopped/,
        );
      }),
    ));

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

  it("a Child's needs bubble up until something Provides them", () => {
    const Orphan = Actor.make('Orphan', {}).build({
      children: { todos: Todos },
    });
    const bubbled: Effect.Effect<unknown, never, Session | Scope.Scope> =
      Runtime.start(Orphan);
    // @ts-expect-error Session is still needed: nothing above Todos Provides it
    const covered: Effect.Effect<unknown, never, Scope.Scope> =
      Runtime.start(Orphan);
    expect([bubbled, covered]).toBeDefined();
  });

  it('a Capability Provided in one State does not reach Children of another', () => {
    const Wrong = Actor.make('Wrong', { state: AuthState }).build({
      init: () => ({ state: { _tag: 'Checking' } }),
      state: {
        Anonymous: { children: { todos: Todos } },
        Authenticated: {
          provides: (self) =>
            Layer.effect(
              Session,
              Effect.gen(function* () {
                const user = yield* SubscriptionRef.make(
                  (yield* self.get).state.user,
                );
                return { user, logOut: Effect.void };
              }),
            ),
        },
      },
    });
    // @ts-expect-error Session reaches Authenticated only, and Todos lives in Anonymous
    const covered: Effect.Effect<unknown, never, Scope.Scope> =
      Runtime.start(Wrong);
    expect(covered).toBeDefined();
  });

  it('a Capability Provided at the top reaches the Children of every State', () => {
    const Top = Actor.make('Top', { state: AuthState }).build({
      init: () => ({ state: { _tag: 'Checking' } }),
      provides: () =>
        Layer.effect(
          Session,
          Effect.gen(function* () {
            const user = yield* SubscriptionRef.make('ada');
            return { user, logOut: Effect.void };
          }),
        ),
      state: { Anonymous: { children: { todos: Todos } } },
    });
    const covered: Effect.Effect<unknown, never, Scope.Scope> =
      Runtime.start(Top);
    expect(covered).toBeDefined();
  });

  it("an Actor's own code reaches only what it Requires", () => {
    const Greedy = Actor.make('Greedy', {}).build({
      workers: {
        // @ts-expect-error Server is not in Requires
        check: { run: () => Effect.flatMap(Server, (s) => s.checkSession) },
      },
    });
    const Asks = Actor.make('Asks', { requires: [Server] }).build({
      workers: {
        check: { run: () => Effect.flatMap(Server, (s) => s.checkSession) },
      },
    });
    expect([Greedy, Asks]).toBeDefined();
  });

  it('a Provide in a State sees that State narrowed', () => {
    const Narrow = Actor.make('Narrow', { state: AuthState }).build({
      init: () => ({ state: { _tag: 'Checking' } }),
      state: {
        Anonymous: {
          provides: (self) =>
            Layer.effect(
              Session,
              Effect.gen(function* () {
                const user = yield* SubscriptionRef.make(
                  // @ts-expect-error Anonymous has no user
                  (yield* self.get).state.user,
                );
                return { user, logOut: Effect.void };
              }),
            ),
        },
      },
    });
    expect(Narrow).toBeDefined();
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
          workers: {
            echo: {
              run: (self) =>
                self.changes.pipe(
                  Stream.filter(({ model }) => model.n === 1),
                  Stream.runForEach(() => self.send({ _tag: 'Pong' })),
                ),
            },
          },
          on: {
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

  it('stop closes every Worker and Command, and Time stands still', () =>
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

describe('levels', () => {
  class Clock2 extends Context.Service<
    Clock2,
    { readonly tick: Effect.Effect<void> }
  >()('test/Clock2') {}

  /** A Child that counts its own ticks, through the Capability from above. */
  const Ticker = Actor.make('Ticker', {
    requires: [Clock2],
    model: Schema.Struct({ ticks: Schema.Number }),
    message: Schema.TaggedUnion({ Ticked: {} }),
  }).build({
    init: () => ({ model: { ticks: 0 } }),
    on: { Ticked: (_, { model }) => ({ model: { ticks: model.ticks + 1 } }) },
    workers: {
      alive: {
        run: () =>
          Effect.addFinalizer(() =>
            Effect.sync(() => heard.push('ticker gone')),
          ).pipe(
            Effect.andThen(Effect.flatMap(Clock2, (clock) => clock.tick)),
            Effect.andThen(Effect.never),
          ),
      },
    },
  });

  const Door = Actor.make('Door', {
    state: Schema.TaggedUnion({ Open: {}, Shut: {} }),
    model: Schema.Struct({ loud: Schema.Boolean }),
    message: Schema.TaggedUnion({ Toggle: {}, Hush: {} }),
  }).build({
    init: () => ({ model: { loud: true }, state: { _tag: 'Open' } }),
    provides: () =>
      Layer.succeed(Clock2, {
        tick: Effect.sync(() => heard.push('tick')),
      }),
    children: { ticker: Ticker },
    on: { Hush: (_, { model }) => ({ model: { ...model, loud: false } }) },
    state: {
      Open: {
        children: { guest: Counter },
        on: { Toggle: () => ({ state: { _tag: 'Shut' } }) },
        workers: {
          creak: {
            while: ({ model }) => model.loud,
            run: () =>
              Effect.addFinalizer(() =>
                Effect.sync(() => heard.push('creak stopped')),
              ).pipe(Effect.andThen(Effect.never)),
          },
        },
      },
      Shut: { on: { Toggle: () => ({ state: { _tag: 'Open' } }) } },
    },
  });

  it('a Child written at the top lasts through Transitions, with its data and work', () =>
    run(
      Effect.gen(function* () {
        heard.length = 0;
        const app = yield* Runtime.start(Door);
        yield* settle;
        expect(heard).toEqual(['tick']);
        expect(Object.keys(app.snapshot().children).sort()).toEqual([
          'guest',
          'ticker',
        ]);

        app.send('Door/ticker#1', { _tag: 'Ticked' });
        app.send('Door', { _tag: 'Toggle' });
        app.send('Door', { _tag: 'Toggle' });
        yield* settle;

        expect(at(app, 'Door/ticker#1').model).toEqual({ ticks: 1 });
        expect(at(app, 'Door/guest#2')).toBeDefined();
        expect(heard).toEqual(['tick', 'creak stopped']);
        expect(app.snapshotAt(app.state().head)).toEqual(app.snapshot());
      }),
    ));

  it('a Worker in a State block runs only in that State, and only while its test holds', () =>
    run(
      Effect.gen(function* () {
        heard.length = 0;
        const app = yield* Runtime.start(Door);
        yield* settle;
        expect(app.workers('Door').map((w) => w.name)).toEqual(['creak']);
        app.send('Door', { _tag: 'Hush' });
        yield* settle;
        expect(heard).toEqual(['tick', 'creak stopped']);
        expect(Door.definition.workers['creak']).toMatchObject({
          kind: 'while',
          state: 'Open',
        });
      }),
    ));

  it('a top-level Child is drawn in every State', () => {
    const kids: Types<typeof Door>['children']['Shut'] = {
      ticker: Ticker,
    };
    expect(kids).toBeDefined();
  });

  it('a name written twice is an error', () => {
    expect(() =>
      Actor.make('Twice', {
        state: Schema.TaggedUnion({ A: {} }),
      }).build({
        init: () => ({ state: { _tag: 'A' } }),
        children: { kid: Counter },
        state: { A: { children: { kid: Counter } } },
      }),
    ).toThrow('Child "kid" is written at the top and in A');
  });

  it('a Message with no rule at any level is warned about once, when built', () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    const shape = {
      state: Schema.TaggedUnion({ A: {}, B: {} }),
      message: Schema.Union([
        Schema.TaggedStruct('Went', { to: Schema.String }),
        Schema.TaggedStruct('Forgot', {}),
      ]),
    };
    const warned = () =>
      logged.mock.calls.filter((call) =>
        call.join(' ').includes('Message "Forgot" has no rule'),
      ).length;
    Actor.make('Forgetful', shape).build({
      init: () => ({ state: { _tag: 'A' } }),
      state: {
        A: {
          on: {
            Went: ({ to }) => ({ state: to ? { _tag: 'B' } : { _tag: 'A' } }),
          },
        },
      },
    });
    expect(warned()).toBe(1);
    Actor.make('Careful', shape).build({
      init: () => ({ state: { _tag: 'A' } }),
      on: { Forgot: () => ({}) },
      state: { B: { on: { Went: () => ({}) } } },
    });
    expect(warned()).toBe(1);
    logged.mockRestore();
  });

  it('a misspelled Message or State does not compile', () => {
    const Typo = Actor.make('Typo', {
      state: Schema.TaggedUnion({ Idle: {}, Loading: {} }),
      message: Schema.TaggedUnion({ Typed: {} }),
    });
    expect(() =>
      Typo.build({
        init: () => ({ state: { _tag: 'Idle' } }),
        // @ts-expect-error: no Message is tagged Typd
        on: { Typed: () => ({}), Typd: () => ({}) },
        // @ts-expect-error: no State is tagged Lodaing
        state: { Lodaing: {} },
      }),
    ).not.toThrow();
  });
});
