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
import { Authz } from '../../authz/index.js';
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
            { email: 'Ada@Kestack.Test' },
            { email: 'bob@kestack.test', name: 'Bob' },
          ),
        }),
      ),
    ).toEqual([
      ['ada@kestack.test', 'ada', false],
      ['bob@kestack.test', 'Bob', true],
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
            { email: 'ada@kestack.test' },
            { email: 'bob@kestack.test' },
            { email: 'ada@kestack.test' },
          ),
        }),
      ),
    ).toEqual([
      ['bob@kestack.test', 'bob', false],
      ['ada@kestack.test', 'ada', true],
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
        ).toBe('ada@kestack.test');
        const switched = yield* listed;
        yield* accounts.signOut(ada);
        const signedOut = yield* listed;
        yield* accounts.signOutAll;
        return [switched, signedOut, yield* listed] as const;
      }),
      fakeAccounts({
        choose: queue(
          { email: 'ada@kestack.test' },
          { email: 'bob@kestack.test' },
        ),
      }),
    );
    expect(switched).toEqual([
      ['ada@kestack.test', 'ada', true],
      ['bob@kestack.test', 'bob', false],
    ]);
    expect(signedOut).toEqual([['bob@kestack.test', 'bob', true]]);
    expect(none).toEqual([]);
  });

  it('keeps fake Accounts in the storage it is given', async () => {
    const storage = Memory.make(fakeAccountsTable).layer;
    await run(
      Effect.flatMap(Accounts, (accounts) => accounts.signIn()),
      fakeAccounts({ choose: queue({ email: 'ada@kestack.test' }), storage }),
    );
    expect(
      await run(listed, fakeAccounts({ choose: queue(), storage })),
    ).toEqual([['ada@kestack.test', 'ada', true]]);
  });

  it('signs a named User in at once, as a Test User', async () => {
    const state = await run(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        yield* accounts.signIn({ test: { email: 'tess@kestack.test' } });
        yield* accounts.signIn({
          test: { email: 'Ada@Kestack.Test', key: 'ignored' },
        });
        return yield* accounts.current;
      }),
      fakeAccounts({ choose: Effect.die('never asked') }),
    );
    expect(state).toMatchObject({
      _tag: 'SignedIn',
      active: { email: 'ada@kestack.test', test: true },
      accounts: [
        { email: 'tess@kestack.test', test: true },
        { email: 'ada@kestack.test', test: true },
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
      fakeAccounts({ choose: queue({ email: 'ada@kestack.test' }), storage }),
    );
    expect(fakeAccountsTable.logicalName).toBe('auth-local-accounts');
    const ada = state._tag === 'SignedIn' ? state.active : null;
    expect(ada?.id).toBe('local_YWRhQGtlc3RhY2sudGVzdA');
    const token = fakeToken.make({
      id: ada!.id,
      email: 'ada@kestack.test',
      name: 'ada',
    });
    expect(token).toBe(
      `local.${btoa(JSON.stringify({ id: 'local_YWRhQGtlc3RhY2sudGVzdA', email: 'ada@kestack.test', name: 'ada' })).replace(/=+$/, '')}`,
    );
    expect(fakeToken.read(token)).toEqual({
      id: 'local_YWRhQGtlc3RhY2sudGVzdA',
      email: 'ada@kestack.test',
      name: 'ada',
    });
    expect(fakeToken.read('real-session-token')).toBeNull();
  });

  it('signs nobody in at an email outside kestack.test', async () => {
    const state = await run(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        yield* accounts.signIn();
        yield* accounts.signIn({ test: { email: 'tess@example.test' } });
        return yield* accounts.current;
      }),
      fakeAccounts({ choose: queue({ email: 'ada@example.com' }) }),
    );
    expect(state).toEqual(AccountsState.SignedOut());
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

  it('reads the User each fake-signed RPC call names', async () => {
    const [before, ada, tess] = await run(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const before = yield* call;
        yield* accounts.signIn();
        const ada = yield* call;
        yield* accounts.signIn({ test: { email: 'tess@kestack.test' } });
        return [before, ada, yield* call] as const;
      }),
      fakeAccounts({ choose: queue({ email: 'ada@kestack.test' }) }),
    );
    expect(before).toMatchObject({
      failure: { _tag: 'Unauthenticated', reason: 'Not signed in' },
    });
    expect(ada).toMatchObject({ success: 'ada@kestack.test true' });
    expect(tess).toMatchObject({ success: 'tess@kestack.test true' });
  });

  const callWith = (user: { id: string; email: string; name: string }) =>
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(Api);
      return yield* Effect.result(
        client.WhoAmI(undefined, {
          headers: { authorization: `Bearer ${fakeToken.make(user)}` },
        }),
      );
    }).pipe(Effect.provide(Handlers), Effect.provide(fakeGuard.rpc()));

  it('makes the User from the email again, whatever id the token names', async () => {
    const WhoById = Rpc.make('WhoById', { success: Schema.String }).pipe(
      Authz.required,
    );
    const ById = RpcGroup.make(WhoById);
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(ById);
          return yield* client.WhoById(undefined, {
            headers: {
              authorization: `Bearer ${fakeToken.make({ id: 'real-user-id', email: 'ada@kestack.test', name: 'Ada' })}`,
            },
          });
        }).pipe(
          Effect.provide(
            ById.toLayer({
              WhoById: () => Effect.map(Authz.User, ({ user }) => user.id),
            }),
          ),
          Effect.provide(fakeGuard.rpc()),
        ),
      ),
    );
    expect(result).toBe('local_YWRhQGtlc3RhY2sudGVzdA');
  });

  it('is unauthenticated for a token naming an email outside kestack.test', async () => {
    for (const email of ['ada@example.com', 'tess@example.test'])
      expect(
        await Effect.runPromise(
          Effect.scoped(callWith({ id: 'real-user-id', email, name: 'x' })),
        ),
      ).toMatchObject({ failure: { _tag: 'Unauthenticated' } });
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
          test: { email: 'tess@kestack.test' },
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
    expect(result).toBe('tess@kestack.test true');
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
        chooser.answer({ email: 'ada@kestack.test' });
        return yield* Fiber.join(fiber);
      }),
    );

    expect(answered).toEqual({ email: 'ada@kestack.test' });
    expect(chooser.isAsking()).toBe(false);
    expect(seen).toEqual([true, false]);
  });
});
