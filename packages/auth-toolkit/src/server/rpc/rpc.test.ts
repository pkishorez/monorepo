import { Effect, Layer, Schema } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';
import {
  Rpc,
  RpcClient,
  RpcGroup,
  RpcSerialization,
  RpcServer,
  RpcTest,
} from 'effect/unstable/rpc';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createAuthClient: vi.fn(),
}));

vi.mock('better-auth/client', () => ({
  createAuthClient: mocks.createAuthClient,
}));

import {
  CurrentAuth,
  Forbidden,
  Unauthenticated,
  rpcAuthLayer,
  withAuthCookies,
  withAuthz,
  type AuthPolicy,
} from './rpc.js';

const authLayer = rpcAuthLayer({ authWorkerUrl: 'https://auth.example.com' });

const runRpc = <A extends Rpc.Any, B, E, R>(
  group: RpcGroup.RpcGroup<A>,
  handlers: Layer.Layer<Rpc.ToHandler<A>, never, never>,
  use: (client: RpcClient.RpcClient<A>) => Effect.Effect<B, E, R>,
) =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(group);
    return yield* use(client);
  }).pipe(Effect.scoped, Effect.provide(handlers), Effect.provide(authLayer));

describe('Effect RPC authentication and authorization', () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.createAuthClient.mockReset();
    mocks.createAuthClient.mockReturnValue({ getSession: mocks.getSession });
    mocks.getSession.mockResolvedValue({
      data: { session: { id: 's1' }, user: { id: 'u1' } },
    });
  });

  it('authenticates and provides CurrentAuth when called without a policy', async () => {
    const WhoAmI = Rpc.make('WhoAmI', {
      payload: {},
      success: Schema.String,
    }).pipe(withAuthz());
    const Api = RpcGroup.make(WhoAmI);
    const Handlers = Api.toLayer({
      WhoAmI: () => Effect.map(CurrentAuth, ({ user }) => user.id),
    });

    const result = await Effect.runPromise(
      runRpc(Api, Handlers, (client) =>
        client.WhoAmI({}, { headers: { cookie: 'session=valid' } }),
      ),
    );

    expect(result).toBe('u1');
  });

  it('fails with Unauthenticated when no session is verified', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: null });
    const Private = Rpc.make('Private', {
      payload: {},
      success: Schema.Void,
    }).pipe(withAuthz());
    const Api = RpcGroup.make(Private);
    const Handlers = Api.toLayer({ Private: () => Effect.void });

    const error = await Effect.runPromise(
      runRpc(Api, Handlers, (client) =>
        Effect.flip(client.Private({}, { headers: { cookie: 'invalid' } })),
      ),
    );

    expect(error).toBeInstanceOf(Unauthenticated);
  });

  it('uses the nearest authorization policy and inherits a group policy otherwise', async () => {
    const calls: string[] = [];
    const groupPolicy: AuthPolicy = () =>
      Effect.sync(() => {
        calls.push('group');
      });
    const methodPolicy: AuthPolicy = () =>
      Effect.sync(() => {
        calls.push('method');
      });

    const Inherited = Rpc.make('Inherited', {
      payload: {},
      success: Schema.Void,
    }).pipe(withAuthz());
    const Overridden = Rpc.make('Overridden', {
      payload: {},
      success: Schema.Void,
    }).pipe(withAuthz(methodPolicy));
    const Api = withAuthz(groupPolicy)(RpcGroup.make(Inherited, Overridden));
    const Handlers = Api.toLayer({
      Inherited: () => Effect.void,
      Overridden: () => Effect.void,
    });

    await Effect.runPromise(
      runRpc(Api, Handlers, (client) =>
        client.Inherited({}, { headers: { cookie: 'session=valid' } }),
      ),
    );
    await Effect.runPromise(
      runRpc(Api, Handlers, (client) =>
        client.Overridden({}, { headers: { cookie: 'session=valid' } }),
      ),
    );

    expect(calls).toEqual(['group', 'method']);
  });

  it('returns Forbidden when the selected policy rejects CurrentAuth', async () => {
    const denied: AuthPolicy = () =>
      Effect.fail(new Forbidden({ reason: 'admin required' }));
    const AdminOnly = Rpc.make('AdminOnly', {
      payload: {},
      success: Schema.Void,
    }).pipe(withAuthz(denied));
    const Api = RpcGroup.make(AdminOnly);
    const Handlers = Api.toLayer({ AdminOnly: () => Effect.void });

    const error = await Effect.runPromise(
      runRpc(Api, Handlers, (client) =>
        Effect.flip(
          client.AdminOnly({}, { headers: { cookie: 'session=valid' } }),
        ),
      ),
    );

    expect(error).toBeInstanceOf(Forbidden);
    expect((error as Forbidden).reason).toBe('admin required');
  });

  it('preserves a nested group policy when an outer group declares another policy', async () => {
    const calls: string[] = [];
    const innerPolicy: AuthPolicy = () =>
      Effect.sync(() => {
        calls.push('inner');
      });
    const outerPolicy: AuthPolicy = () =>
      Effect.sync(() => {
        calls.push('outer');
      });

    const InnerRpc = Rpc.make('InnerRpc', {
      payload: {},
      success: Schema.Void,
    });
    const OuterRpc = Rpc.make('OuterRpc', {
      payload: {},
      success: Schema.Void,
    });
    const InnerApi = withAuthz(innerPolicy)(RpcGroup.make(InnerRpc));
    const Api = withAuthz(outerPolicy)(RpcGroup.make(OuterRpc).merge(InnerApi));
    const Handlers = Api.toLayer({
      InnerRpc: () => Effect.void,
      OuterRpc: () => Effect.void,
    });

    await Effect.runPromise(
      runRpc(Api, Handlers, (client) =>
        client.InnerRpc({}, { headers: { cookie: 'session=valid' } }),
      ),
    );
    await Effect.runPromise(
      runRpc(Api, Handlers, (client) =>
        client.OuterRpc({}, { headers: { cookie: 'session=valid' } }),
      ),
    );

    expect(calls).toEqual(['inner', 'outer']);
  });

  it('relays all refreshed cookies and verifies a batched request once', async () => {
    mocks.getSession.mockImplementation(({ fetchOptions }) => {
      const headers = new Headers();
      headers.append('set-cookie', 'session=NEW; Path=/; HttpOnly');
      headers.append('set-cookie', 'session=NEW; Path=/admin; HttpOnly');
      headers.append('set-cookie', 'session_cache=NEW; Path=/; HttpOnly');
      fetchOptions.onSuccess({ response: new Response(null, { headers }) });
      return Promise.resolve({
        data: { session: { id: 's1' }, user: { id: 'u1' } },
      });
    });

    const One = Rpc.make('One', { payload: {}, success: Schema.Void });
    const Two = Rpc.make('Two', { payload: {}, success: Schema.Void });
    const Api = withAuthz()(RpcGroup.make(One, Two));
    const Handlers = Api.toLayer({
      One: () => Effect.void,
      Two: () => Effect.void,
    });
    const request = new Request('https://api.example.com/rpc', {
      method: 'POST',
      headers: { cookie: 'session=OLD' },
      body: JSON.stringify([
        { _tag: 'Request', id: '1', tag: 'One', payload: {}, headers: [] },
        { _tag: 'Request', id: '2', tag: 'Two', payload: {}, headers: [] },
      ]),
    });

    const webResponse = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const app = yield* RpcServer.toHttpEffect(Api);
          const response = yield* withAuthCookies(app).pipe(
            Effect.provideService(
              HttpServerRequest.HttpServerRequest,
              HttpServerRequest.fromWeb(request),
            ),
          );
          return HttpServerResponse.toWeb(response);
        }),
      ).pipe(
        Effect.provide(Handlers),
        Effect.provide(authLayer),
        Effect.provide(RpcSerialization.layerJson),
      ),
    );

    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(webResponse.headers.getSetCookie()).toEqual([
      'session=NEW; Path=/; HttpOnly',
      'session=NEW; Path=/admin; HttpOnly',
      'session_cache=NEW; Path=/; HttpOnly',
    ]);
  });
});
