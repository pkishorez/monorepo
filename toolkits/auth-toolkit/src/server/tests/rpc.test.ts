import { server as httpServer } from '@kestack/rpc-toolkit/rpc/http';
import { Effect, Layer, Schema } from 'effect';
import { Rpc, RpcClient, RpcGroup, RpcTest } from 'effect/rpc';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createAuthClient: vi.fn(),
}));

vi.mock('better-auth/client', () => ({
  createAuthClient: mocks.createAuthClient,
}));

import { Authz, type PolicyGuard, type Principal } from '../../auth/index.js';
import { bearer, expectUser } from '../../guard/index.js';
import { fakeGuard } from '../../fake/index.js';
import { auth, authAs } from '../index.js';

const url = 'https://auth.example.com';

const runRpc = <A extends Rpc.Any, B, E, R>(
  group: RpcGroup.RpcGroup<A>,
  handlers: Layer.Layer<Rpc.ToHandler<A>, never, never>,
  use: (client: RpcClient.RpcClient<A>) => Effect.Effect<B, E, R>,
  server: Layer.Layer<any> = auth.rpc({ url }),
) =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(group);
    return yield* use(client);
  }).pipe(Effect.scoped, Effect.provide(handlers), Effect.provide(server));

const sessionOf = (id: string, email = `${id}@example.com`) => ({
  data: { session: { id: `s-${id}` }, user: { id, email } },
});

describe('auth.rpc auth', () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.createAuthClient.mockReset();
    mocks.createAuthClient.mockReturnValue({ getSession: mocks.getSession });
    mocks.getSession.mockResolvedValue(sessionOf('u1'));
  });

  it('authenticates and provides AuthUser under required', async () => {
    const WhoAmI = Rpc.make('WhoAmI', {
      payload: {},
      success: Schema.String,
    }).pipe(Authz.required);
    const Api = RpcGroup.make(WhoAmI);
    const Handlers = Api.toLayer({
      WhoAmI: () => Effect.map(Authz.User, ({ user }) => user.id),
    });

    const result = await Effect.runPromise(
      runRpc(Api, Handlers, (client) =>
        client.WhoAmI({}, { headers: { cookie: 'session=valid' } }),
      ),
    );

    expect(result).toBe('u1');
  });

  it('fails Unauthenticated when no Sign-in is verified', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: null });
    const Api = Authz.required(
      RpcGroup.make(Rpc.make('Private', { payload: {}, success: Schema.Void })),
    );
    const Handlers = Api.toLayer({ Private: () => Effect.void });

    const error = await Effect.runPromise(
      runRpc(Api, Handlers, (client) =>
        Effect.flip(client.Private({}, { headers: { cookie: 'invalid' } })),
      ),
    );

    expect(error).toBeInstanceOf(Authz.Unauthenticated);
  });

  it('fails Unavailable when the Auth Worker cannot be asked', async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: null,
      error: { status: 503 },
    });
    const Api = Authz.required(
      RpcGroup.make(Rpc.make('Private', { payload: {}, success: Schema.Void })),
    );
    const Handlers = Api.toLayer({ Private: () => Effect.void });

    const error = await Effect.runPromise(
      runRpc(Api, Handlers, (client) =>
        Effect.flip(client.Private({}, { headers: { cookie: 'a=1' } })),
      ),
    );

    expect(error).toBeInstanceOf(Authz.Unavailable);
  });

  it('returns Forbidden when the policy rejects the caller', async () => {
    const AdminOnly = Rpc.make('AdminOnly', {
      payload: {},
      success: Schema.Void,
    }).pipe(Authz.policy(() => false, 'admin required'));
    const Api = RpcGroup.make(AdminOnly);
    const Handlers = Api.toLayer({ AdminOnly: () => Effect.void });

    const error = await Effect.runPromise(
      runRpc(Api, Handlers, (client) =>
        Effect.flip(
          client.AdminOnly({}, { headers: { cookie: 'session=valid' } }),
        ),
      ),
    );

    expect(error).toBeInstanceOf(Authz.Forbidden);
    expect(error).toMatchObject({ reason: 'admin required' });
  });

  describe('expect-user', () => {
    const WhoAmI = Rpc.make('WhoAmI', {
      payload: {},
      success: Schema.String,
    }).pipe(Authz.required);
    const Api = RpcGroup.make(WhoAmI);
    let ran = 0;
    const Handlers = Api.toLayer({
      WhoAmI: () =>
        Effect.map(Authz.User, ({ user }) => {
          ran += 1;
          return user.id;
        }),
    });
    const call = (headers: Record<string, string>) =>
      Effect.runPromise(
        runRpc(Api, Handlers, (client) =>
          Effect.result(client.WhoAmI({}, { headers })),
        ),
      );

    beforeEach(() => {
      ran = 0;
    });

    it('runs a cookie call whose Active Account is the expected User', async () => {
      expect(
        await call({ cookie: 'session=valid', ...expectUser('u1') }),
      ).toMatchObject({ success: 'u1' });
    });

    it('fails AccountChanged before the handler when another User is active', async () => {
      const result = await call({
        cookie: 'session=valid',
        ...expectUser('u2'),
      });
      expect(result).toMatchObject({ failure: { _tag: 'AccountChanged' } });
      expect(ran).toBe(0);
    });

    it('is ignored on a bearer call', async () => {
      expect(
        await call({ ...bearer('device-token'), ...expectUser('u2') }),
      ).toMatchObject({ success: 'u1' });
    });
  });

  it('verifies a Batched RPC Request once and relays every refreshed cookie', async () => {
    mocks.getSession.mockImplementation(({ fetchOptions }) => {
      const headers = new Headers();
      headers.append('set-cookie', 'session=NEW; Path=/; HttpOnly');
      headers.append('set-cookie', 'session_cache=NEW; Path=/; HttpOnly');
      headers.append('set-cookie', 'session_cache_1=NEW; Path=/; HttpOnly');
      fetchOptions.onSuccess({ response: new Response(null, { headers }) });
      return Promise.resolve(sessionOf('u1'));
    });

    const One = Rpc.make('One', { payload: {}, success: Schema.String });
    const Two = Rpc.make('Two', { payload: {}, success: Schema.String });
    const Api = Authz.required(RpcGroup.make(One, Two));
    const Handlers = Api.toLayer({
      One: () => Effect.map(Authz.User, ({ user }) => user.id),
      Two: () => Effect.map(Authz.User, ({ user }) => user.id),
    });
    const answer = httpServer(Api, Layer.mergeAll(Handlers, auth.rpc({ url })));
    const message = (id: string, tag: string) =>
      JSON.stringify({ _tag: 'Request', id, tag, payload: {}, headers: [] });

    const response = await answer(
      new Request('https://api.example.com/rpc', {
        method: 'POST',
        headers: { cookie: 'session=OLD' },
        body: `${message('1', 'One')}\n${message('2', 'Two')}\n`,
      }),
    );
    const body = await response.text();

    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(body.match(/"u1"/g)).toHaveLength(2);
    expect(response.headers.getSetCookie()).toEqual([
      'session=NEW; Path=/; HttpOnly',
      'session_cache=NEW; Path=/; HttpOnly',
      'session_cache_1=NEW; Path=/; HttpOnly',
    ]);
  });

  it('verifies each credential of a batch on its own', async () => {
    mocks.getSession.mockImplementation(({ fetchOptions }) =>
      Promise.resolve(
        sessionOf(
          fetchOptions.headers.authorization === 'Bearer a' ? 'ua' : 'ub',
        ),
      ),
    );
    const One = Rpc.make('One', { payload: {}, success: Schema.String });
    const Api = Authz.required(RpcGroup.make(One));
    const Handlers = Api.toLayer({
      One: () => Effect.map(Authz.User, ({ user }) => user.id),
    });
    const answer = httpServer(Api, Layer.mergeAll(Handlers, auth.rpc({ url })));
    const message = (id: string, token: string) =>
      JSON.stringify({
        _tag: 'Request',
        id,
        tag: 'One',
        payload: {},
        headers: [['authorization', `Bearer ${token}`]],
      });

    const response = await answer(
      new Request('https://api.example.com/rpc', {
        method: 'POST',
        body: `${message('1', 'a')}\n${message('2', 'b')}\n`,
      }),
    );
    const body = await response.text();

    expect(mocks.getSession).toHaveBeenCalledTimes(2);
    expect(body).toContain('"ua"');
    expect(body).toContain('"ub"');
  });
});

describe('Scope policies', () => {
  const user = { id: 'u1', email: 'ada@example.com', name: 'Ada' };
  const token: Principal = {
    kind: 'token',
    user,
    client: { id: 'cli' },
    scopes: ['notes:read'],
    test: false,
  };
  const session: Principal = {
    kind: 'session',
    user,
    session: { id: 's1', expiresAt: new Date(0) },
    test: false,
  };
  const call = (
    principal: Principal,
    guard: ReturnType<typeof Authz.scope>,
    inHandler: Effect.Effect<
      void,
      InstanceType<typeof Authz.Forbidden>,
      Effect.Services<PolicyGuard>
    >,
  ) => {
    const Write = Rpc.make('Write', {
      payload: {},
      success: Schema.String,
      error: Authz.Forbidden,
    }).pipe(guard);
    const Api = RpcGroup.make(Write);
    const Handlers = Api.toLayer({
      Write: () =>
        Effect.andThen(
          inHandler,
          Effect.map(Authz.User, (principal) => principal.kind),
        ),
    });
    return Effect.runPromise(
      Effect.result(
        runRpc(
          Api,
          Handlers,
          (client) => client.Write({}),
          fakeGuard.rpc({ as: principal }),
        ),
      ),
    );
  };

  it('allows a Token Principal carrying the Scope', async () => {
    expect(
      await call(token, Authz.scope('notes:read'), Effect.void),
    ).toMatchObject({
      success: 'token',
    });
  });

  it('forbids a Token Principal missing the Scope', async () => {
    expect(
      await call(token, Authz.scope('notes:write'), Effect.void),
    ).toMatchObject({
      failure: { _tag: 'Forbidden' },
    });
  });

  it('forbids a Sign-in Principal, which has no Scopes', async () => {
    expect(
      await call(session, Authz.scope('notes:read'), Effect.void),
    ).toMatchObject({ failure: { _tag: 'Forbidden' } });
  });

  it('checks a Scope inside a handler with yield*', async () => {
    const guard = Authz.scope('notes:read');
    const inHandler = Effect.gen(function* () {
      yield* Authz.scope('notes:write');
    });
    expect(await call(token, guard, inHandler)).toMatchObject({
      failure: { _tag: 'Forbidden', reason: 'Scope required: notes:write' },
    });
    expect(
      await call(
        token,
        guard,
        Effect.gen(function* () {
          yield* Authz.scope('notes:read');
        }),
      ),
    ).toMatchObject({ success: 'token' });
  });
});

describe('Test Users', () => {
  const WhoAmI = Rpc.make('WhoAmI', {
    payload: {},
    success: Schema.String,
  }).pipe(Authz.required);
  const Api = RpcGroup.make(WhoAmI);
  const Handlers = Api.toLayer({
    WhoAmI: () => Effect.map(Authz.User, ({ user }) => user.email),
  });
  const call = (server: Layer.Layer<any>, headers: Record<string, string>) =>
    Effect.runPromise(
      Effect.result(
        runRpc(
          Api,
          Handlers,
          (client) => client.WhoAmI({}, { headers }),
          server,
        ),
      ),
    );

  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.createAuthClient.mockReset();
    mocks.createAuthClient.mockReturnValue({ getSession: mocks.getSession });
  });

  it('refuses a Test User by cookie or Device token unless the backend admits them', async () => {
    mocks.getSession.mockResolvedValue(sessionOf('tess', 'tess@example.test'));
    for (const headers of [
      { cookie: 'session=valid' },
      bearer('device-token'),
    ]) {
      expect(await call(auth.rpc({ url }), headers)).toMatchObject({
        failure: { _tag: 'Forbidden', reason: 'Test Users are not accepted' },
      });
      expect(
        await call(auth.rpc({ url, testUsers: true }), headers),
      ).toMatchObject({ success: 'tess@example.test' });
    }
  });

  it('leaves everyone else alone', async () => {
    mocks.getSession.mockResolvedValue(sessionOf('ada', 'ada@example.com'));
    for (const server of [
      auth.rpc({ url }),
      auth.rpc({ url, testUsers: true }),
    ]) {
      expect(await call(server, { cookie: 'session=valid' })).toMatchObject({
        success: 'ada@example.com',
      });
    }
  });
});

describe('auth.rpc auth options', () => {
  it('needs a url', () => {
    expect(() => auth.rpc({} as never)).toThrow(/url/);
    expect(() => auth.rpc({ url: '' })).toThrow(/url/);
  });
});

describe('auth.rpc authAs', () => {
  const WhoAmI = Rpc.make('WhoAmI', {
    payload: {},
    success: Schema.String,
  }).pipe(Authz.required);
  const Api = RpcGroup.make(WhoAmI);
  const Handlers = Api.toLayer({
    WhoAmI: () => Effect.map(Authz.User, ({ user }) => user.id),
  });
  const ada = {
    kind: 'session',
    user: { id: 'ada', email: 'ada@example.com', name: 'Ada' },
    session: { id: 's-ada', expiresAt: new Date(0) },
    test: false,
  } satisfies Principal;
  const call = (
    caller: Effect.Effect<Principal | null, unknown>,
    headers: Record<string, string> = {},
    options?: Parameters<typeof authAs>[1],
  ) =>
    Effect.runPromise(
      Effect.result(
        runRpc(
          Api,
          Handlers,
          (client) => client.WhoAmI({}, { headers }),
          authAs(caller, options),
        ),
      ),
    );

  it('takes the caller it is given at each call, asking no one', async () => {
    expect(await call(Effect.succeed(ada))).toMatchObject({ success: 'ada' });
    expect(mocks.createAuthClient).not.toHaveBeenCalled();
  });

  it('is unauthenticated for nobody', async () => {
    expect(await call(Effect.succeed(null))).toMatchObject({
      failure: { _tag: 'Unauthenticated' },
    });
  });

  it('still refuses a call expecting another User', async () => {
    expect(await call(Effect.succeed(ada), expectUser('grace'))).toMatchObject({
      failure: { _tag: 'AccountChanged' },
    });
  });

  it('fails Unavailable when the caller could not be found out', async () => {
    expect(await call(Effect.fail(new Error('down')))).toMatchObject({
      failure: { _tag: 'Unavailable' },
    });
  });

  it('refuses a Test User unless told to admit them', async () => {
    const tess = Effect.succeed({ ...ada, test: true });
    expect(await call(tess)).toMatchObject({
      failure: { _tag: 'Forbidden' },
    });
    expect(await call(tess, {}, { testUsers: true })).toMatchObject({
      success: 'ada',
    });
  });
});

describe('fakeGuard.rpc as', () => {
  it('admits the Principal it is given, a Test User too', async () => {
    const Api = RpcGroup.make(
      Rpc.make('WhoAmI', { payload: {}, success: Schema.String }).pipe(
        Authz.required,
      ),
    );
    const Handlers = Api.toLayer({
      WhoAmI: () => Effect.map(Authz.User, ({ test }) => String(test)),
    });
    const tess = {
      kind: 'session',
      user: { id: 'tess', email: 'tess@example.test', name: 'Tess' },
      session: { id: 's-tess', expiresAt: new Date(0) },
      test: true,
    } satisfies Principal;
    expect(
      await Effect.runPromise(
        runRpc(
          Api,
          Handlers,
          (client) => client.WhoAmI({}),
          fakeGuard.rpc({ as: tess }),
        ),
      ),
    ).toBe('true');
  });

  it('with `as: null` has nobody behind every call', async () => {
    const Api = RpcGroup.make(
      Rpc.make('WhoAmI', { payload: {}, success: Schema.String }).pipe(
        Authz.required,
      ),
    );
    const Handlers = Api.toLayer({
      WhoAmI: () => Effect.map(Authz.User, ({ user }) => user.id),
    });
    const exit = await Effect.runPromise(
      Effect.exit(
        runRpc(
          Api,
          Handlers,
          (client) => client.WhoAmI({}),
          fakeGuard.rpc({ as: null }),
        ),
      ),
    );
    expect(exit).toMatchObject({
      _tag: 'Failure',
      cause: { reasons: [{ error: { _tag: 'Unauthenticated' } }] },
    });
  });
});
