import type { Session, User } from 'better-auth';
import { Effect, Layer } from 'effect';
import { Rpc, RpcClient, RpcGroup, RpcTest } from 'effect/rpc';
import { Authz } from '@kstackz/auth-toolkit/guard';
import { authz } from '@kstackz/auth-toolkit/server';

type Resolve = (typeof Authz.Resolver)['Service']['resolve'];

export const resolvedAuth = (
  userId = 'u1',
  refreshedCookies: ReadonlyArray<string> = [],
) => ({
  current: {
    kind: 'session' as const,
    session: { id: `session-${userId}` } as Session,
    user: { id: userId } as User,
  },
  refreshedCookies,
});

export const authLayer = (
  resolve: Resolve = () => Effect.succeed(resolvedAuth()),
) =>
  authz.layer.pipe(
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
