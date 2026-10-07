import { Context, Effect, Layer, Schema, Stream } from 'effect';
import { Headers } from 'effect/http';
import { Rpc, RpcClient, RpcGroup, RpcMiddleware } from 'effect/rpc';
import type { RpcClientError } from 'effect/rpc/RpcClientError';
import { describe, expect, it } from 'vitest';

import { client as inProcessClient } from './index.ts';

class CurrentUser extends Context.Service<CurrentUser, string>()(
  'test/CurrentUser',
) {}

class NotFound extends Schema.Error<NotFound>('test/NotFound')({
  _tag: Schema.tag('NotFound'),
  id: Schema.String,
}) {}

class Auth extends RpcMiddleware.Service<Auth, { provides: CurrentUser }>()(
  'test/Auth',
  { requiredForClient: true },
) {}

const WhoAmI = Rpc.make('WhoAmI', { success: Schema.String });
const Get = Rpc.make('Get', {
  payload: { id: Schema.String },
  success: Schema.String,
  error: NotFound,
});
const Count = Rpc.make('Count', {
  payload: { to: Schema.Number },
  success: Schema.Number,
  stream: true,
});
const Api = RpcGroup.make(WhoAmI, Get, Count).middleware(Auth);

const Handlers = Api.toLayer({
  WhoAmI: () => Effect.map(CurrentUser, (user) => user),
  Get: ({ id }) =>
    id === 'a' ? Effect.succeed('found a') : Effect.fail(new NotFound({ id })),
  Count: ({ to }) => Stream.range(1, to),
});

const AuthLive = Layer.succeed(Auth)((effect, { headers }) =>
  Effect.provideService(effect, CurrentUser, headers['x-user'] ?? 'anon'),
);

const AuthClient = (user: string | undefined) =>
  RpcMiddleware.layerClient(Auth, ({ request, next }) =>
    next(
      user === undefined
        ? request
        : {
            ...request,
            headers: Headers.set(request.headers, 'x-user', user),
          },
    ),
  );

const run = <A, E>(
  use: (
    client: RpcClient.FromGroup<typeof Api, RpcClientError>,
  ) => Effect.Effect<A, E>,
  user?: string,
) =>
  Effect.runPromise(
    Effect.flatMap(RpcClient.make(Api), use).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.merge(
          inProcessClient(Api, Layer.merge(Handlers, AuthLive)),
          AuthClient(user),
        ),
      ),
    ),
  );

describe('Rpc.inProcess.client', () => {
  it('reaches the handler', async () => {
    expect(await run((client) => client.Get({ id: 'a' }))).toBe('found a');
  });

  it('streams', async () => {
    const values = await run((client) =>
      Stream.runCollect(client.Count({ to: 3 })),
    );
    expect(values).toEqual([1, 2, 3]);
  });

  it('carries a header set by client middleware to server middleware', async () => {
    expect(await run((client) => client.WhoAmI(), 'u1')).toBe('u1');
  });

  it('carries a header set with RpcClient.withHeaders to server middleware', async () => {
    expect(
      await run((client) =>
        client.WhoAmI().pipe(RpcClient.withHeaders({ 'x-user': 'u2' })),
      ),
    ).toBe('u2');
  });

  it('delivers handler errors typed', async () => {
    const error = await run((client) => Effect.flip(client.Get({ id: 'b' })));
    expect(error).toBeInstanceOf(NotFound);
    expect(error).toMatchObject({ _tag: 'NotFound', id: 'b' });
  });
});
