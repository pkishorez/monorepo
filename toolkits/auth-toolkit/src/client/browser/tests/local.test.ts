import { Memory } from '@kestack/std-toolkit/db/memory';
import { Effect, Fiber, type Layer, Schema, type Scope } from 'effect';
import { Rpc, RpcGroup, RpcTest } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import { localToken } from '../../../contract/index.js';
import {
  bearerToken,
  type Principal,
  rpcMiddleware,
  Unauthenticated,
  User,
} from '../../../guard/index.js';
import { Accounts, AccountsState } from '../../accounts/index.js';
import { browser, localAccountsTable, localChooser } from '../index.js';

/** Signs in whoever is next in line, as a test's stand-in for a dialog. */
const queue = (...choices: Array<{ email: string; name?: string } | null>) =>
  Effect.sync(() => choices.shift() ?? null);

const run = <A, E>(
  effect: Effect.Effect<A, E, Accounts | Scope.Scope>,
  layer: Layer.Layer<Accounts> = browser({ local: { choose: queue() } }),
) => Effect.runPromise(Effect.scoped(effect).pipe(Effect.provide(layer)));

const listed = Effect.flatMap(Accounts, ({ current }) =>
  Effect.map(current, (state) =>
    state._tag === 'SignedIn'
      ? state.accounts.map(({ email, name }) => [
          email,
          name,
          email === state.active.email,
        ])
      : [],
  ),
);

describe('browser options', () => {
  it('refuses a url with Local mode', () => {
    expect(() =>
      browser({
        url: 'https://auth.example.com',
        local: { choose: queue() },
      } as never),
    ).toThrow(/not both/);
  });

  it('refuses a Local mode that is not an object', () => {
    expect(() => browser({ local: false } as never)).toThrow(/local/);
  });
});

describe('browser in Local mode', () => {
  it('signs in whoever was chosen and makes them the Active Account', async () => {
    expect(
      await run(
        Effect.gen(function* () {
          const accounts = yield* Accounts;
          yield* accounts.signIn();
          yield* accounts.signIn();
          return yield* listed;
        }),
        browser({
          local: {
            choose: queue(
              { email: 'Ada@Demo' },
              { email: 'bob@demo', name: 'Bob' },
            ),
          },
        }),
      ),
    ).toEqual([
      ['ada@demo', 'ada', false],
      ['bob@demo', 'Bob', true],
    ]);
  });

  it('signs nobody in when nobody was chosen', async () => {
    const state = await run(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        yield* accounts.signIn();
        return yield* accounts.current;
      }),
      browser({ local: { choose: queue(null) } }),
    );
    expect(state).toEqual(AccountsState.SignedOut());
  });

  it('signing in an account again only makes it active', async () => {
    expect(
      await run(
        Effect.gen(function* () {
          const accounts = yield* Accounts;
          yield* accounts.signIn();
          yield* accounts.signIn();
          yield* accounts.signIn();
          return yield* listed;
        }),
        browser({
          local: {
            choose: queue(
              { email: 'ada@demo' },
              { email: 'bob@demo' },
              { email: 'ada@demo' },
            ),
          },
        }),
      ),
    ).toEqual([
      ['bob@demo', 'bob', false],
      ['ada@demo', 'ada', true],
    ]);
  });

  it('switches, and signing out the Active Account makes another active', async () => {
    const [switched, signedOut, none] = await run(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        yield* accounts.signIn();
        yield* accounts.signIn();
        const state = yield* accounts.current;
        const ada =
          state._tag === 'SignedIn' ? state.accounts[0]!.id : 'missing';
        yield* accounts.switchTo(ada);
        const switched = yield* listed;
        yield* accounts.signOut(ada);
        const signedOut = yield* listed;
        yield* accounts.signOutAll;
        return [switched, signedOut, yield* listed] as const;
      }),
      browser({
        local: { choose: queue({ email: 'ada@demo' }, { email: 'bob@demo' }) },
      }),
    );
    expect(switched).toEqual([
      ['ada@demo', 'ada', true],
      ['bob@demo', 'bob', false],
    ]);
    expect(signedOut).toEqual([['bob@demo', 'bob', true]]);
    expect(none).toEqual([]);
  });

  it('keeps Local Accounts in the storage it is given', async () => {
    const storage = Memory.make(localAccountsTable).layer;
    await run(
      Effect.flatMap(Accounts, (accounts) => accounts.signIn()),
      browser({ local: { choose: queue({ email: 'ada@demo' }), storage } }),
    );
    expect(
      await run(listed, browser({ local: { choose: queue(), storage } })),
    ).toEqual([['ada@demo', 'ada', true]]);
  });

  it('signs each guarded call with the Active Account’s Local Token', async () => {
    const WhoAmI = rpcMiddleware.with()(
      Rpc.make('WhoAmI', { success: Schema.String }),
    );
    const Api = RpcGroup.make(WhoAmI);
    const Handlers = Api.toLayer({
      WhoAmI: () => Effect.map(User, ({ user }) => user.email),
    });
    // Local mode's server half: the User a Local Token names.
    const Local = rpcMiddleware.layer(({ headers }) => {
      const token = bearerToken({ get: (name) => headers[name] ?? null });
      const user = token ? localToken.read(token) : null;
      return user
        ? Effect.succeed({ user } as unknown as Principal)
        : Effect.fail(new Unauthenticated({ reason: 'No Local Token' }));
    });
    const call = Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(Api);
      return yield* Effect.result(client.WhoAmI());
    }).pipe(Effect.provide(Handlers), Effect.provide(Local));

    const [before, after] = await run(
      Effect.gen(function* () {
        const before = yield* call;
        yield* (yield* Accounts).signIn();
        return [before, yield* call] as const;
      }),
      browser({ local: { choose: queue({ email: 'ada@demo' }) } }),
    );
    expect(before).toMatchObject({
      failure: { _tag: 'Unauthenticated', reason: 'Not signed in' },
    });
    expect(after).toMatchObject({ success: 'ada@demo' });
  });
});

describe('localChooser', () => {
  it('waits for an answer while asking', async () => {
    const chooser = localChooser();
    const seen: boolean[] = [];
    chooser.subscribe(() => seen.push(chooser.isAsking()));

    const answered = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(chooser.choose);
        yield* Effect.yieldNow;
        expect(chooser.isAsking()).toBe(true);
        chooser.answer({ email: 'ada@demo' });
        return yield* Fiber.join(fiber);
      }),
    );

    expect(answered).toEqual({ email: 'ada@demo' });
    expect(chooser.isAsking()).toBe(false);
    expect(seen).toEqual([true, false]);
  });
});
