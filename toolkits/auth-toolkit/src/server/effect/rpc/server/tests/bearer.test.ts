import { Effect, Layer, Schema } from 'effect';
import { Rpc, RpcGroup, RpcTest } from 'effect/rpc';
import { describe, expect, it } from 'vitest';

import {
  localToken,
  localUser,
} from '../../../../../auth-worker-contract/index.js';
import { Authz } from '../../declaration/index.js';
import { authzLayer, resolverLocal } from '../server.js';

const WhoAmI = Rpc.make('WhoAmI', {
  payload: {},
  success: Schema.String,
}).pipe(Authz.guard());
const Api = RpcGroup.make(WhoAmI);
const Handlers = Api.toLayer({
  WhoAmI: () => Effect.map(Authz.CurrentAuth, ({ user }) => user.email),
});

const call = (token: (() => string | null) | Effect.Effect<string>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(Api);
      return yield* Effect.result(client.WhoAmI({}));
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(
          Handlers,
          authzLayer.pipe(Layer.provide(resolverLocal)),
          Authz.bearer(token),
        ),
      ),
    ),
  );

describe('Authz.bearer', () => {
  it('signs each call with the token it reads at that call', async () => {
    let token = localToken.make(localUser({ email: 'ada@example.com' }));
    const read = () => token;

    expect(await call(read)).toMatchObject({ success: 'ada@example.com' });
    token = localToken.make(localUser({ email: 'grace@example.com' }));
    expect(await call(read)).toMatchObject({ success: 'grace@example.com' });
  });

  it('waits for a token given as an Effect', async () => {
    const later = Promise.withResolvers<string>();
    const result = call(Effect.promise(() => later.promise));
    later.resolve(localToken.make(localUser({ email: 'ada@example.com' })));
    expect(await result).toMatchObject({ success: 'ada@example.com' });
  });

  it('sends nothing while there is no token', async () => {
    expect(await call(() => null)).toMatchObject({
      failure: { _tag: 'Unauthenticated' },
    });
  });
});
