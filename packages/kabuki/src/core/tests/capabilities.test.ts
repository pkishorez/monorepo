import { Effect, Layer, Option, SubscriptionRef } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Runtime } from '../index.ts';
import {
  Server,
  Session,
  SignIn,
  Todos,
  AuthState,
  Auth,
  built,
  ServerLive,
  settle,
  run,
  started,
  send,
} from './fixtures.ts';

/* Capabilities: what an Actor Requires, and what it Provides to everything below it. */

describe('Provides', () => {
  it('is built once per State, and follows the Model from inside', () =>
    run(
      Effect.gen(function* () {
        built.length = 0;
        const app = yield* started;
        yield* settle;
        send(app, 'Auth', { _tag: 'LoggedIn', user: 'ada' });
        yield* settle;
        send(app, 'Auth', { _tag: 'Renamed', user: 'grace' });
        yield* settle;
        expect(built).toEqual(['ada']);
      }),
    ));

  it('says what each level provides in its Blueprint', () => {
    expect(Auth.blueprint.top.provides).toEqual([]);
    expect(Auth.blueprint.state['Anonymous']!.provides).toEqual([SignIn.key]);
    expect(Auth.blueprint.state['Authenticated']!.provides).toEqual([
      Session.key,
    ]);
  });

  it('passes down only the Capabilities it names, whatever else its Layer builds', () =>
    run(
      Effect.gen(function* () {
        const seen: Array<string> = [];
        const Looks = Actor.define('Looks', {}).build({
          workers: {
            look: {
              run: () =>
                Effect.gen(function* () {
                  if (Option.isSome(yield* Effect.serviceOption(SignIn)))
                    seen.push('SignIn');
                  if (Option.isSome(yield* Effect.serviceOption(Server)))
                    seen.push('Server');
                }),
            },
          },
        });
        const Gives = Actor.define('Gives', {}).build({
          // @ts-expect-error its Layer builds Server too, which it does not name
          provides: {
            capabilities: [SignIn],
            layer: () =>
              Layer.mergeAll(
                Layer.succeed(SignIn, { complete: () => Effect.void }),
                ServerLive,
              ),
          },
          children: { looks: Actor.child(Looks) },
        });
        const app = yield* Runtime.scoped(Gives);
        yield* settle;
        expect(seen).toEqual(['SignIn']);
        expect(app.actor.blueprint.top.provides).toEqual([SignIn.key]);
      }),
    ));

  it('is refused at build when written as a bare Layer', () => {
    expect(() =>
      Actor.define('Bare', {}).build({
        // @ts-expect-error `provides` names its Capabilities beside its Layer
        provides: () => ServerLive,
      }),
    ).toThrow('`provides` at the top names the Capabilities it gives');
  });
});

describe('Requires and Provides', () => {
  it('a tree needs only what no ancestor Provides', () => {
    const covered = Runtime.scoped(Auth, { layer: ServerLive });
    // @ts-expect-error Server is needed, and no Layer gives it
    const short = Runtime.scoped(Auth);
    expect([covered, short]).toBeDefined();
  });

  it("a Child's needs bubble up until something Provides them", () => {
    const Orphan = Actor.define('Orphan', {}).build({
      children: { todos: Actor.child(Todos) },
    });
    const SessionLive = Layer.effect(
      Session,
      Effect.gen(function* () {
        const user = yield* SubscriptionRef.make('ada');
        return { user, logOut: Effect.void };
      }),
    );
    const covered = Runtime.scoped(Orphan, { layer: SessionLive });
    // @ts-expect-error Session is still needed: nothing above Todos Provides it
    const short = Runtime.scoped(Orphan);
    expect([covered, short]).toBeDefined();
  });

  it('a Capability Provided in one State does not reach Children of another', () => {
    const Wrong = Actor.define('Wrong', { state: AuthState }).build({
      init: () => ({ state: { _tag: 'Checking' } }),
      states: {
        Anonymous: { children: { todos: Actor.child(Todos) } },
        Authenticated: {
          provides: {
            capabilities: [Session],
            layer: (self) =>
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
      },
    });
    // @ts-expect-error Session reaches Authenticated only, and Todos lives in Anonymous
    const short = Runtime.scoped(Wrong);
    expect(short).toBeDefined();
  });

  it('a Capability Provided at the top reaches the Children of every State', () => {
    const Top = Actor.define('Top', { state: AuthState }).build({
      init: () => ({ state: { _tag: 'Checking' } }),
      provides: {
        capabilities: [Session],
        layer: () =>
          Layer.effect(
            Session,
            Effect.gen(function* () {
              const user = yield* SubscriptionRef.make('ada');
              return { user, logOut: Effect.void };
            }),
          ),
      },
      states: { Anonymous: { children: { todos: Actor.child(Todos) } } },
    });
    const covered: Effect.Effect<unknown, never, Scope.Scope> =
      Runtime.scoped(Top);
    expect(covered).toBeDefined();
  });

  it("an Actor's own code reaches only what it Requires", () => {
    const Greedy = Actor.define('Greedy', {}).build({
      workers: {
        // @ts-expect-error Server is not in Requires
        check: { run: () => Effect.flatMap(Server, (s) => s.checkSession) },
      },
    });
    const Asks = Actor.define('Asks', { requires: [Server] }).build({
      workers: {
        check: { run: () => Effect.flatMap(Server, (s) => s.checkSession) },
      },
    });
    expect([Greedy, Asks]).toBeDefined();
  });

  it('a Provide in a State sees that State narrowed', () => {
    const Narrow = Actor.define('Narrow', { state: AuthState }).build({
      init: () => ({ state: { _tag: 'Checking' } }),
      states: {
        Anonymous: {
          provides: {
            capabilities: [Session],
            layer: (self) =>
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
      },
    });
    expect(Narrow).toBeDefined();
  });
});
