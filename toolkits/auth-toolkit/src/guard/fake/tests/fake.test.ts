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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Authz } from '../../authz/index.js';
import { Accounts, AccountsState } from '../../client/accounts/index.js';
import { fakeAccounts, fakeGuard, fakeSignIn } from '../index.js';
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

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('keeps the formats devices hold', async () => {
    const state = await run(
      Effect.gen(function* () {
        yield* (yield* Accounts).signIn();
        return yield* (yield* Accounts).current;
      }),
      fakeAccounts({ choose: queue({ email: 'ada@kestack.test' }) }),
    );
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

  it('comes back where a sign-in asks, else where it was made to, as the real one does', async () => {
    const assign = vi.fn();
    const here = 'https://app.example.com/a/ada';
    vi.stubGlobal('window', { location: { href: here, assign } });
    /** Signs in as the next chosen, and says whether it completed here. */
    const signIn = (options?: { readonly returnTo: string }) =>
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const fiber = yield* Effect.forkChild(accounts.signIn(options), {
          startImmediately: true,
        });
        yield* Effect.sleep(5);
        const done = fiber.pollUnsafe() !== undefined;
        yield* Fiber.interrupt(fiber);
        return done;
      });
    const layer = fakeAccounts({
      choose: queue(
        { email: 'ada@kestack.test' },
        { email: 'bob@kestack.test' },
        { email: 'cy@kestack.test' },
      ),
      returnTo: 'https://app.example.com/',
    });
    const [done, kept] = await run(
      Effect.gen(function* () {
        // On this page: signed in in place.
        const inPlace = yield* signIn({ returnTo: here });
        // Elsewhere, as the Layer says: the page leaves, as the real one's.
        const home = yield* signIn();
        // Elsewhere, as the sign-in says.
        const asked = yield* signIn({
          returnTo: 'https://app.example.com/a/cy',
        });
        // The pages it left for read them anew.
        yield* (yield* Accounts).check;
        return [[inPlace, home, asked], yield* listed] as const;
      }),
      layer,
    );
    expect(done).toEqual([true, false, false]);
    expect(assign.mock.calls.map(([to]) => to)).toEqual([
      'https://app.example.com/',
      'https://app.example.com/a/cy',
    ]);
    // Each is signed in, for the page it left for to read.
    expect(kept.map(([email]) => email)).toEqual([
      'ada@kestack.test',
      'bob@kestack.test',
      'cy@kestack.test',
    ]);
  });

  it('fails a sign-in at an email outside kestack.test, signing nobody in', async () => {
    const [exit, state] = await run(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const exit = yield* Effect.exit(accounts.signIn());
        return [exit, yield* accounts.check] as const;
      }),
      fakeAccounts({ choose: queue({ email: 'ada@example.com' }) }),
    );
    expect(exit).toMatchObject({
      _tag: 'Failure',
      cause: { reasons: [{ error: { _tag: 'AuthWorkerRejected' } }] },
    });
    expect(state).toEqual(AccountsState.SignedOut());
  });
});

describe('fakeGuard', () => {
  const WhoAmI = Rpc.make('WhoAmI', { success: Schema.String }).pipe(
    Authz.required,
  );
  const Api = RpcGroup.make(WhoAmI);
  const Handlers = Api.toLayer({
    WhoAmI: () => Effect.map(Authz.User, ({ user }) => user.email),
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
        yield* accounts.signIn();
        return [before, ada, yield* call] as const;
      }),
      fakeAccounts({
        choose: queue(
          { email: 'ada@kestack.test' },
          { email: 'tess@kestack.test' },
        ),
      }),
    );
    expect(before).toMatchObject({
      failure: { _tag: 'Unauthenticated', reason: 'Not signed in' },
    });
    expect(ada).toMatchObject({ success: 'ada@kestack.test' });
    expect(tess).toMatchObject({ success: 'tess@kestack.test' });
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

  it('puts a fake User on a Sign-in of its own behind every call, as a device holds one', async () => {
    const WhoSignedIn = Rpc.make('WhoSignedIn', {
      success: Schema.String,
    }).pipe(Authz.required);
    const Signed = RpcGroup.make(WhoSignedIn);
    const as = fakeSignIn('Ada@kestack.test', 'laptop');
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(Signed);
          return yield* client.WhoSignedIn();
        }).pipe(
          Effect.provide(
            Signed.toLayer({
              WhoSignedIn: () =>
                Effect.map(Authz.User, (principal) =>
                  principal.kind === 'session'
                    ? `${principal.user.id} ${principal.session.id}`
                    : 'token',
                ),
            }),
          ),
          Effect.provide(fakeGuard.rpc({ as })),
        ),
      ),
    );
    expect(result).toBe('local_YWRhQGtlc3RhY2sudGVzdA laptop');
    expect(fakeSignIn('ada@example.com', 'laptop')).toBeNull();
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
        Effect.map(Authz.User, ({ user }) => user.email),
      ),
    );
    const result = await run(
      Effect.gen(function* () {
        yield* (yield* Accounts).signIn();
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
      fakeAccounts({ choose: queue({ email: 'tess@kestack.test' }) }),
    );
    expect(result).toBe('tess@kestack.test');
  });
});
