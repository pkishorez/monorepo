import type { Session, User } from 'better-auth';
import { Effect, Layer } from 'effect';
import { Rpc, RpcClient, RpcGroup, RpcTest } from 'effect/unstable/rpc';
import { Authz } from 'auth-toolkit/rpc';
import { authzLayer } from 'auth-toolkit/rpc/server';

type Resolve = (typeof Authz.Resolver)['Service']['resolve'];

export const resolvedAuth = (
  userId = 'u1',
  refreshedCookies: ReadonlyArray<string> = [],
) => ({
  currentAuth: {
    session: { id: `session-${userId}` } as Session,
    user: { id: userId } as User,
  },
  refreshedCookies,
});

export const authLayer = (
  resolve: Resolve = () => Effect.succeed(resolvedAuth()),
) =>
  authzLayer.pipe(
    Layer.provide(
      Layer.succeed(Authz.Resolver, Authz.Resolver.of({ resolve })),
    ),
  );

export const runRpc = <A extends Rpc.Any, B, E, R>(
  group: RpcGroup.RpcGroup<A>,
  handlers: Layer.Layer<Rpc.ToHandler<A>, never, never>,
  use: (client: RpcClient.RpcClient<A>) => Effect.Effect<B, E, R>,
  authentication = authLayer(),
) =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(group);
    return yield* use(client);
  }).pipe(
    Effect.scoped,
    Effect.provide(handlers),
    Effect.provide(authentication),
  );
