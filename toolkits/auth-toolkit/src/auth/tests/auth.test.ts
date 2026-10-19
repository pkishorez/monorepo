import { Effect, Layer, Schema } from 'effect';
import { Rpc, RpcClient, RpcGroup, RpcTest } from 'effect/rpc';
import { describe, expect, it } from 'vitest';

import { testAuth } from '../../server/rpc/index.js';
import { Auth, type PolicyGuard } from '../index.js';

const signedIn = testAuth({
  kind: 'token',
  user: { id: 'u1', email: 'ada@example.com', name: 'Ada' },
  client: { id: 'cli' },
  scopes: [],
});

const runRpc = <A extends Rpc.Any, B, E>(
  group: RpcGroup.RpcGroup<A>,
  handlers: Layer.Layer<Rpc.ToHandler<A>, never, never>,
  use: (client: RpcClient.RpcClient<A>) => Effect.Effect<B, E>,
) =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(group);
    return yield* use(client);
  }).pipe(
    Effect.scoped,
    Effect.provide(handlers),
    Effect.provide(signedIn),
    Effect.runPromise,
  );

const recording = (calls: string[], name: string) =>
  Auth.policy(() => {
    calls.push(name);
    return true;
  }, name);

describe('Auth', () => {
  it('uses the nearest policy and inherits a group policy otherwise', async () => {
    const calls: string[] = [];
    const Inherited = Rpc.make('Inherited', {
      payload: {},
      success: Schema.Void,
    }).pipe(Auth.required);
    const Overridden = Rpc.make('Overridden', {
      payload: {},
      success: Schema.Void,
    }).pipe(recording(calls, 'method'));
    const Api = recording(calls, 'group')(RpcGroup.make(Inherited, Overridden));
    const Handlers = Api.toLayer({
      Inherited: () => Effect.void,
      Overridden: () => Effect.void,
    });

    await runRpc(Api, Handlers, (client) => client.Inherited({}));
    await runRpc(Api, Handlers, (client) => client.Overridden({}));

    expect(calls).toEqual(['group', 'method']);
  });

  it('keeps a nested group policy when an outer group declares another', async () => {
    const calls: string[] = [];
    const InnerRpc = Rpc.make('InnerRpc', {
      payload: {},
      success: Schema.Void,
    });
    const OuterRpc = Rpc.make('OuterRpc', {
      payload: {},
      success: Schema.Void,
    });
    const InnerApi = recording(calls, 'inner')(RpcGroup.make(InnerRpc));
    const Api = recording(
      calls,
      'outer',
    )(RpcGroup.make(OuterRpc).merge(InnerApi));
    const Handlers = Api.toLayer({
      InnerRpc: () => Effect.void,
      OuterRpc: () => Effect.void,
    });

    await runRpc(Api, Handlers, (client) => client.InnerRpc({}));
    await runRpc(Api, Handlers, (client) => client.OuterRpc({}));

    expect(calls).toEqual(['inner', 'outer']);
  });

  it('checks a policy as an Effect against Auth.User', async () => {
    const principal = {
      kind: 'token' as const,
      user: { id: 'u1', email: 'ada@example.com', name: 'Ada' },
      client: { id: 'cli' },
      scopes: ['notes:read'],
    };
    const run = (check: PolicyGuard) =>
      Effect.runPromise(
        Effect.result(Effect.provideService(check, Auth.User, principal)),
      );

    expect(await run(Auth.scope('notes:read'))).toMatchObject({
      _tag: 'Success',
    });
    expect(await run(Auth.scope('notes:read', 'notes:write'))).toMatchObject({
      failure: { _tag: 'Forbidden' },
    });
    expect(
      await run(Auth.policy((p) => p.user.id === 'u2', 'not u2')),
    ).toMatchObject({ failure: { _tag: 'Forbidden', reason: 'not u2' } });
  });
});
