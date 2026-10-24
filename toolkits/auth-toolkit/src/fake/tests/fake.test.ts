import { Memory } from '@kestack/std-toolkit/db/memory';
import { NodeHttpPlatform, NodeServices } from '@effect/platform-node';
import { Effect, Fiber, Layer, Schema, type Scope, Stream } from 'effect';
import { Etag } from 'effect/http';
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiTest,
} from 'effect/http-api';
import { Rpc, RpcGroup, RpcTest } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import { Authz } from '../../auth/index.js';
import { Accounts, AccountsState } from '../../client/accounts/index.js';
import {
  fakeAccounts,
  fakeAccountsTable,
  fakeChooser,
  fakeGuard,
} from '../index.js';
import { fakeToken } from '../token.js';

/** Signs in whoever is next in line, as a test's stand-in for a dialog. */
const queue = (...choices: Array<{ email: string; name?: string } | null>) =>
  Effect.sync(() => choices.shift() ?? null);

const run = <A, E>(
  effect: Effect.Effect<A, E, Accounts | Scope.Scope>,
  layer: Layer.Layer<Accounts> = fakeAccounts({ choose: queue() }),
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

describe('fakeAccounts', () => {
  it('signs in whoever was chosen and makes them the Active Account', async () => {
    expect(
      await run(
        Effect.gen(function* () {
          const accounts = yield* Accounts;
          yield* accounts.signIn();
          yield* accounts.signIn();
          return yield* listed;
        }),
        fakeAccounts({
          choose: queue(
            { email: 'Ada@Demo' },
            { email: 'bob@demo', name: 'Bob' },
          ),
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
      fakeAccounts({ choose: queue(null) }),
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
        fakeAccounts({
          choose: queue(
            { email: 'ada@demo' },
            { email: 'bob@demo' },
            { email: 'ada@demo' },
          ),
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
        const during = yield* Effect.forkChild(
          accounts.state.pipe(Stream.drop(1), Stream.runHead),
        );
        yield* Effect.yieldNow;
        yield* accounts.switchTo(ada);
        const shown = yield* Fiber.join(during);
        expect(
          shown._tag === 'Some' && shown.value._tag === 'SignedIn'
            ? shown.value.switchingTo?.email
            : null,
        ).toBe('ada@demo');
        const switched = yield* listed;
        yield* accounts.signOut(ada);
        const signedOut = yield* listed;
        yield* accounts.signOutAll;
        return [switched, signedOut, yield* listed] as const;
      }),
      fakeAccounts({
        choose: queue({ email: 'ada@demo' }, { email: 'bob@demo' }),
      }),
    );
    expect(switched).toEqual([
      ['ada@demo', 'ada', true],
      ['bob@demo', 'bob', false],
    ]);
    expect(signedOut).toEqual([['bob@demo', 'bob', true]]);
    expect(none).toEqual([]);
  });

  it('keeps fake Accounts in the storage it is given', async () => {
    const storage = Memory.make(fakeAccountsTable).layer;
    await run(
      Effect.flatMap(Accounts, (accounts) => accounts.signIn()),
      fakeAccounts({ choose: queue({ email: 'ada@demo' }), storage }),
    );
    expect(
      await run(listed, fakeAccounts({ choose: queue(), storage })),
    ).toEqual([['ada@demo', 'ada', true]]);
  });

  it('signs a named User in at once, any email, marking Test Users', async () => {
    const state = await run(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        yield* accounts.signIn({ test: { email: 'tess@example.test' } });
        yield* accounts.signIn({ test: { email: 'Ada@Demo', key: 'ignored' } });
        return yield* accounts.current;
      }),
      fakeAccounts({ choose: Effect.die('never asked') }),
    );
    expect(state).toMatchObject({
      _tag: 'SignedIn',
      active: { email: 'ada@demo', test: false },
      accounts: [
        { email: 'tess@example.test', test: true },
        { email: 'ada@demo', test: false },
      ],
    });
  });

  it('keeps the formats devices hold', async () => {
    const storage = Memory.make(fakeAccountsTable).layer;
    const state = await run(
      Effect.gen(function* () {
        yield* (yield* Accounts).signIn();
        return yield* (yield* Accounts).current;
      }),
      fakeAccounts({ choose: queue({ email: 'ada@demo' }), storage }),
    );
    expect(fakeAccountsTable.logicalName).toBe('auth-local-accounts');
    const ada = state._tag === 'SignedIn' ? state.active : null;
    expect(ada?.id).toBe('local_YWRhQGRlbW8');
    const token = fakeToken.make({
      id: ada!.id,
      email: 'ada@demo',
      name: 'ada',
    });
    expect(token).toBe(
      `local.${btoa(JSON.stringify({ id: 'local_YWRhQGRlbW8', email: 'ada@demo', name: 'ada' })).replace(/=+$/, '')}`,
    );
    expect(fakeToken.read(token)).toEqual({
      id: 'local_YWRhQGRlbW8',
      email: 'ada@demo',
      name: 'ada',
    });
    expect(fakeToken.read('real-session-token')).toBeNull();
  });
});

describe('fakeGuard', () => {
  const WhoAmI = Rpc.make('WhoAmI', { success: Schema.String }).pipe(
    Authz.required,
  );
  const Api = RpcGroup.make(WhoAmI);
  const Handlers = Api.toLayer({
    WhoAmI: () =>
      Effect.map(Authz.User, ({ user, test }) => `${user.email} ${test}`),
  });
  const call = Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(Api);
    return yield* Effect.result(client.WhoAmI());
  }).pipe(Effect.provide(Handlers), Effect.provide(fakeGuard.rpc()));

  it('reads the User each fake-signed RPC call names, Test Users included', async () => {
    const [before, ada, tess] = await run(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const before = yield* call;
        yield* accounts.signIn();
        const ada = yield* call;
        yield* accounts.signIn({ test: { email: 'tess@example.test' } });
        return [before, ada, yield* call] as const;
      }),
      fakeAccounts({ choose: queue({ email: 'ada@demo' }) }),
    );
    expect(before).toMatchObject({
      failure: { _tag: 'Unauthenticated', reason: 'Not signed in' },
    });
    expect(ada).toMatchObject({ success: 'ada@demo false' });
    expect(tess).toMatchObject({ success: 'tess@example.test true' });
  });

  it('is unauthenticated for any other credential', async () => {
    const Unsigned = Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(Api);
      return yield* Effect.result(
        client.WhoAmI(undefined, {
          headers: { authorization: 'Bearer real-session-token' },
        }),
      );
    }).pipe(Effect.provide(Handlers), Effect.provide(fakeGuard.rpc()));
    expect(await Effect.runPromise(Effect.scoped(Unsigned))).toMatchObject({
      failure: { _tag: 'Unauthenticated' },
    });
  });

  it('guards HttpApi the same way', async () => {
    const Me = HttpApiEndpoint.get('me', '/me', { success: Schema.String });
    const Group = Authz.required(HttpApiGroup.make('fake').add(Me));
    class HttpApiFake extends HttpApi.make('fake-api').add(Group) {}
    const HttpHandlers = HttpApiBuilder.group(HttpApiFake, 'fake', (handlers) =>
      handlers.handle('me', () =>
        Effect.map(Authz.User, ({ user, test }) => `${user.email} ${test}`),
      ),
    );
    const result = await run(
      Effect.gen(function* () {
        yield* (yield* Accounts).signIn({
          test: { email: 'tess@example.test' },
        });
        const client = yield* HttpApiTest.groups(HttpApiFake, ['fake']);
        return yield* client.fake.me();
      }).pipe(
        Effect.provide(HttpHandlers),
        Effect.provide(fakeGuard.http()),
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            NodeHttpPlatform.layer,
            Etag.layer,
          ),
        ),
      ),
      fakeAccounts({ choose: queue() }),
    );
    expect(result).toBe('tess@example.test true');
  });
});

describe('fakeChooser', () => {
  it('waits for an answer while asking', async () => {
    const chooser = fakeChooser();
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
