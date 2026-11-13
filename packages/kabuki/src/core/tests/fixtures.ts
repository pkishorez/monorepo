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
import { expect } from 'vitest';
import {
  Actor,
  Address,
  Command,
  History,
  Runtime,
  Snapshot,
} from '../index.ts';
import type { From, HistoryEntry, Instance, Sent } from '../types.ts';

/* The Actors, Layers and helpers the core tests share. */

export class Server extends Context.Service<
  Server,
  { readonly checkSession: Effect.Effect<string | undefined> }
>()('test/Server') {}

export class SignIn extends Context.Service<
  SignIn,
  { readonly complete: (user: string) => Effect.Effect<void> }
>()('test/SignIn') {}

export class Session extends Context.Service<
  Session,
  {
    readonly user: SubscriptionRef.SubscriptionRef<string>;
    readonly logOut: Effect.Effect<void>;
  }
>()('test/Session') {}

export const signIn = Command.make('signIn', {
  args: Schema.Struct({ name: Schema.String }),
  run: ({ name }) =>
    Effect.gen(function* () {
      yield* (yield* SignIn).complete(name);
    }),
});

export const Login = Actor.define('Login', {
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
    Submitted: (_, { model }) => ({ command: signIn({ name: model.name }) }),
  },
});

export const logOut = Command.make('logOut', {
  run: () =>
    Effect.gen(function* () {
      yield* (yield* Session).logOut;
    }),
});

export const Todos = Actor.define('Todos', {
  requires: [Session],
  model: Schema.Struct({ items: Schema.Array(Schema.String) }),
  message: Schema.TaggedUnion({ Added: { text: Schema.String }, Quit: {} }),
}).build({
  init: () => ({ model: { items: [] } }),
  on: {
    Added: (message, { model }) => ({
      model: { items: [...model.items, message.text] },
    }),
    Quit: () => ({ command: logOut() }),
  },
});

export const AuthState = Schema.TaggedUnion({
  Checking: {},
  Anonymous: {},
  Authenticated: { user: Schema.String },
});

export const Auth = Actor.define('Auth', {
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
  states: {
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
      children: { login: Actor.child(Login) },
      provides: {
        capabilities: [SignIn],
        layer: (self) =>
          Layer.succeed(SignIn, {
            complete: (user) => self.send({ _tag: 'LoggedIn', user }),
          }),
      },
      on: {
        LoggedIn: ({ user }) => ({ state: { _tag: 'Authenticated', user } }),
      },
    },
    Authenticated: {
      children: { todos: Actor.child(Todos) },
      provides: {
        capabilities: [Session],
        layer: (self) =>
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
      on: {
        Renamed: ({ user }) => ({ state: { _tag: 'Authenticated', user } }),
        LoggedOut: () => ({ state: { _tag: 'Anonymous' } }),
      },
    },
  },
});

/** Every user a Session was built for: once per entry into Authenticated. */
export const built: Array<string> = [];

export const ServerLive = Layer.succeed(Server, {
  checkSession: Effect.succeed(undefined),
});

/** Let forked work run. */
export const settle = Effect.gen(function* () {
  for (let i = 0; i < 10; i++) yield* Effect.yieldNow;
});

/** The Instance at an Address in the Runtime's Snapshot, which must be there. */
export const at = (app: Runtime<any>, address: string): Instance => {
  const instance = Snapshot.at(app.snapshot, address as Address);
  expect(instance, address).toBeDefined();
  return instance!;
};

/** Text written by hand as an Address of the Runtime's app, which its Blueprint must have. */
export const to = (app: Runtime<any>, text: string): Address => {
  const address = Address.check(app.actor, text);
  expect(address, text).toBeDefined();
  return address!;
};

/** The History kept beside each Runtime the helpers below made. */
const recorded = new WeakMap<Runtime<any>, { history: History }>();

/** Keep a History beside a Runtime made stopped, then start it, so every entry it plays is in it. */
const record = <R extends Runtime<any>>(app: R, start: boolean): R => {
  const kept = { history: History.init(app.snapshot) };
  recorded.set(app, kept);
  app.subscribe((entries) => {
    kept.history = History.add(kept.history, entries);
  });
  if (start) void app.start();
  return app;
};

/** `Runtime.scoped`, with a History kept beside the Runtime for the helpers below. */
export const scoped = ((actor: any, options?: any) =>
  Effect.map(Runtime.scoped(actor, { ...options, running: false }), (app) =>
    record(app, options?.running !== false),
  )) as typeof Runtime.scoped;

/** `Runtime.make`, with a History kept beside the Runtime for the helpers below. */
export const make = ((actor: any, options?: any) =>
  record(
    Runtime.make(actor, { ...options, running: false }),
    options?.running !== false,
  )) as typeof Runtime.make;

/** The History kept beside a Runtime that `scoped` or `make` made. */
export const historyOf = (app: Runtime<any>): History => {
  const kept = recorded.get(app);
  if (!kept) throw new Error('make the Runtime with the fixtures to read it');
  return kept.history;
};

/** The entries from the first to the Head. */
export const line = (app: Runtime<any>): ReadonlyArray<HistoryEntry> =>
  History.entries(historyOf(app));

/** The tags of the Messages from the first entry to the Head. */
export const tags = (app: Runtime<any>): ReadonlyArray<string> =>
  line(app).map((entry) => entry.message._tag);

/** The Snapshot right after an entry (`null`: the start), replayed from the History. */
export const seek = (app: Runtime<any>, entry: number | null): Snapshot =>
  History.snapshot(app.actor, historyOf(app), entry);

/** What came of an entry, worked out again by playing it from the Snapshot before it. */
export const outcome = (app: Runtime<any>, id: number) => {
  const entry = History.entry(historyOf(app), id)!;
  return Snapshot.next(app.actor, seek(app, entry.parent), entry).outcome;
};

/** Send a Message to the Instance at an Address written by hand, from outside; `refused` when none is there. */
export const send = (
  app: Runtime<any>,
  text: string,
  message: { readonly _tag: string; readonly [field: string]: unknown },
  from?: From,
): Sent => app.at(to(app, text))?.send(message as never, from) ?? 'refused';

/** Stop the Runtime, from Effect code. */
export const stop = (app: Runtime<any>) => Effect.promise(() => app.stop());

/** Run the Runtime again, from Effect code. */
export const start = (app: Runtime<any>) => Effect.promise(() => app.start());

/** Move the History's Head to an entry (`null`: the start), and have the Runtime start again from the Snapshot there, from Effect code. */
export const fork = (app: Runtime<any>, entry: number | null) =>
  Effect.promise(() => {
    const kept = recorded.get(app)!;
    kept.history = History.move(kept.history, entry);
    return app.follow(History.snapshot(app.actor, kept.history), {
      restart: true,
    });
  });

export const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

export const timed = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())),
  );

export const started = Effect.suspend(() =>
  scoped(Auth, { layer: ServerLive }),
);

export const Counter = Actor.define('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({ Bumped: {} }),
}).build({
  init: () => ({ model: { count: 0 } }),
  on: { Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }) },
});

export const Board = Actor.define('Board', {}).build({
  children: { left: Actor.child(Counter), right: Actor.child(Counter) },
});

/** What work did, seen from outside. */
export const heard: Array<string> = [];

/** An errand that rings after a second. */
export const ring = Command.make('ring', {
  run: () =>
    Effect.sleep('1 second').pipe(Effect.as({ _tag: 'Rang' as const })),
});

/** Commands that ring, and a Worker that streams while the Model says so. */
export const Timer = Actor.define('Timer', {
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
    Wait: () => ({ command: ring() }),
    Both: () => ({ command: [ring(), ring()] }),
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

/** A Worker for the whole Instance, and one for while it is Running. */
export const Metronome = Actor.define('Metronome', {
  state: Schema.TaggedUnion({ Running: {}, Resting: {} }),
  model: Schema.Struct({ beats: Schema.Number }),
  message: Schema.TaggedUnion({ Beat: {}, Rest: {}, Ping: {}, Pong: {} }),
}).build({
  init: () => ({ model: { beats: 0 }, state: { _tag: 'Running' } }),
  on: {
    Ping: () => ({
      command: Command.make('pong', {
        run: () =>
          Effect.sleep('1 second').pipe(
            Effect.tap(() => Effect.sync(() => heard.push('pong'))),
            Effect.as({ _tag: 'Pong' as const }),
          ),
      })(),
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
  states: {
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
export const Uploads = Actor.define('Uploads', {
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
export const Once = Actor.define('Once', {
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
export const Alarm = Actor.define('Alarm', {
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
