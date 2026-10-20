import { server as httpServer } from '@kestack/rpc-toolkit/rpc/http';
import type { Session, User } from 'better-auth';
import { Effect, Layer, Schema } from 'effect';
import { Headers as HttpHeaders } from 'effect/http';
import { Rpc, RpcClient, RpcGroup, RpcTest } from 'effect/rpc';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createAuthClient: vi.fn(),
}));

vi.mock('better-auth/client', () => ({
  createAuthClient: mocks.createAuthClient,
}));

import {
  Authz,
  type PolicyGuard,
  type Principal,
} from '../../../auth/index.js';
import { localToken, localUser } from '../../../contract/index.js';
import {
  bearer,
  expectUser,
  rpcMiddleware,
  type Signature,
} from '../../../guard/index.js';
import { auth, authAs, testAuth } from '../index.js';

const url = 'https://auth.example.com';

const runRpc = <A extends Rpc.Any, B, E, R>(
  group: RpcGroup.RpcGroup<A>,
  handlers: Layer.Layer<Rpc.ToHandler<A>, never, never>,
  use: (client: RpcClient.RpcClient<A>) => Effect.Effect<B, E, R>,
  server: Layer.Layer<any> = auth({ url }),
) =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(group);
    return yield* use(client);
  }).pipe(Effect.scoped, Effect.provide(handlers), Effect.provide(server));

const sessionOf = (id: string) => ({
  data: { session: { id: `s-${id}` }, user: { id } },
});

describe('server/rpc auth', () => {
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
    const answer = httpServer(Api, Layer.mergeAll(Handlers, auth({ url })));
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
    const answer = httpServer(Api, Layer.mergeAll(Handlers, auth({ url })));
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
  };
  const session: Principal = {
    kind: 'session',
    user: user as User,
    session: { id: 's1' } as Session,
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
          testAuth(principal),
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

/** The Guard's client half for Effect RPC, signing every call with
 * `signature`. */
const signedWith = (signature: Signature<never>) =>
  rpcMiddleware.client(({ request, next }) =>
    Effect.flatMap(signature, (headers) =>
      next({
        ...request,
        headers: HttpHeaders.setAll(request.headers, headers),
      }),
    ),
  );

describe('Local mode', () => {
  const WhoAmI = Rpc.make('WhoAmI', {
    payload: {},
    success: Schema.String,
  }).pipe(Authz.required);
  const Api = RpcGroup.make(WhoAmI);
  const Handlers = Api.toLayer({
    WhoAmI: () => Effect.map(Authz.User, ({ user }) => user.email),
  });

  const call = (token: Effect.Effect<string | null>) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(Api);
        return yield* Effect.result(client.WhoAmI({}));
      }).pipe(
        Effect.scoped,
        Effect.provide(
          Layer.mergeAll(
            Handlers,
            auth({ local: true }),
            signedWith(
              Effect.flatMap(token, (current) =>
                current === null
                  ? Effect.fail(
                      new Authz.Unauthenticated({ reason: 'No token yet' }),
                    )
                  : Effect.succeed(bearer(current)),
              ),
            ),
          ),
        ),
      ),
    );

  it('reads the User a Local Token names, asking no one', async () => {
    let token = localToken.make(localUser({ email: 'ada@example.com' }));
    const read = Effect.sync(() => token);

    expect(await call(read)).toMatchObject({ success: 'ada@example.com' });
    token = localToken.make(localUser({ email: 'grace@example.com' }));
    expect(await call(read)).toMatchObject({ success: 'grace@example.com' });
    expect(mocks.createAuthClient).not.toHaveBeenCalled();
  });

  it('sends nothing while the signature fails', async () => {
    expect(await call(Effect.succeed(null))).toMatchObject({
      failure: { _tag: 'Unauthenticated', reason: 'No token yet' },
    });
  });

  it('is unauthenticated for any other credential', async () => {
    expect(await call(Effect.succeed('real-session-token'))).toMatchObject({
      failure: { _tag: 'Unauthenticated' },
    });
  });
});

describe('server/rpc authAs', () => {
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
    user: { id: 'ada' } as User,
    session: { id: 's-ada' } as Session,
  } satisfies Principal;
  const call = (
    caller: Effect.Effect<Principal | null, unknown>,
    headers: Record<string, string> = {},
  ) =>
    Effect.runPromise(
      Effect.result(
        runRpc(
          Api,
          Handlers,
          (client) => client.WhoAmI({}, { headers }),
          authAs(caller),
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
});
