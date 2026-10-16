import { Effect, Layer, SubscriptionRef } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Runtime } from '../index.ts';
import {
  Server,
  Session,
  Todos,
  AuthState,
  Auth,
  built,
  ServerLive,
  settle,
  run,
  started,
} from './fixtures.ts';

/* Capabilities: what an Actor Requires, and what it Provides to everything below it. */

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

describe('Requires and Provides', () => {
  it('a tree needs only what no ancestor Provides', () => {
    const covered = Runtime.start(Auth, ServerLive);
    // @ts-expect-error Server is needed, and no Layer gives it
    const short = Runtime.start(Auth);
    expect([covered, short]).toBeDefined();
  });

  it("a Child's needs bubble up until something Provides them", () => {
    const Orphan = Actor.build(Actor.define('Orphan', {}), {
      children: { todos: { actor: Todos } },
    });
    const SessionLive = Layer.effect(
      Session,
      Effect.gen(function* () {
        const user = yield* SubscriptionRef.make('ada');
        return { user, logOut: Effect.void };
      }),
    );
    const covered = Runtime.start(Orphan, SessionLive);
    // @ts-expect-error Session is still needed: nothing above Todos Provides it
    const short = Runtime.start(Orphan);
    expect([covered, short]).toBeDefined();
  });

  it('a Capability Provided in one State does not reach Children of another', () => {
    const Wrong = Actor.build(Actor.define('Wrong', { state: AuthState }), {
      init: () => ({ state: { _tag: 'Checking' } }),
      state: {
        Anonymous: { children: { todos: { actor: Todos } } },
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
    const short = Runtime.start(Wrong);
    expect(short).toBeDefined();
  });

  it('a Capability Provided at the top reaches the Children of every State', () => {
    const Top = Actor.build(Actor.define('Top', { state: AuthState }), {
      init: () => ({ state: { _tag: 'Checking' } }),
      provides: () =>
        Layer.effect(
          Session,
          Effect.gen(function* () {
            const user = yield* SubscriptionRef.make('ada');
            return { user, logOut: Effect.void };
          }),
        ),
      state: { Anonymous: { children: { todos: { actor: Todos } } } },
    });
    const covered: Effect.Effect<unknown, never, Scope.Scope> =
      Runtime.start(Top);
    expect(covered).toBeDefined();
  });

  it("an Actor's own code reaches only what it Requires", () => {
    const Greedy = Actor.build(Actor.define('Greedy', {}), {
      workers: {
        // @ts-expect-error Server is not in Requires
        check: { run: () => Effect.flatMap(Server, (s) => s.checkSession) },
      },
    });
    const Asks = Actor.build(Actor.define('Asks', { requires: [Server] }), {
      workers: {
        check: { run: () => Effect.flatMap(Server, (s) => s.checkSession) },
      },
    });
    expect([Greedy, Asks]).toBeDefined();
  });

  it('a Provide in a State sees that State narrowed', () => {
    const Narrow = Actor.build(Actor.define('Narrow', { state: AuthState }), {
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
