import { Effect, Layer, Option, Schema } from 'effect';
import { Rpc as EffectRpc, RpcClient, RpcGroup } from 'effect/rpc';
import { expect, it } from 'vitest';
import { Rpc } from '../rpc/index.ts';

// contract.ts: imported by client and server
class TooManyCalls extends Schema.Error<TooManyCalls>('app/TooManyCalls')({
  _tag: Schema.tag('TooManyCalls'),
}) {}

/** How many calls one endpoint accepts. */
const RateLimit = Rpc.middleware<number>()('app/RateLimit', {
  error: TooManyCalls,
});

const Search = EffectRpc.make('Search', { success: Schema.String }).pipe(
  RateLimit.with(2),
);
const List = EffectRpc.make('List', { success: Schema.String });
const Api = RateLimit.with(100)(RpcGroup.make(Search, List));

// server.ts: the server half counts Fresh Calls per endpoint
const RateLimitLive = RateLimit.layer(
  Effect.sync(() => {
    const calls = new Map<string, number>();
    return ({ rpc, value }) =>
      Effect.gen(function* () {
        if ((yield* Rpc.websocket.InvocationKind) === 'replay') return;
        const count = (calls.get(rpc._tag) ?? 0) + 1;
        calls.set(rpc._tag, count);
        if (count > Option.getOrElse(value, () => Infinity)) {
          return yield* new TooManyCalls();
        }
      });
  }),
);
const Handlers = Api.toLayer({
  Search: () => Effect.succeed('found'),
  List: () => Effect.succeed('listed'),
});

it('stops a call past its endpoint limit, the nearest limit winning', async () => {
  const results = await Effect.gen(function* () {
    const api = yield* RpcClient.make(Api);
    return yield* Effect.forEach(
      [api.Search, api.Search, api.Search, api.List],
      (call) =>
        call().pipe(
          Effect.catchTag('TooManyCalls', () => Effect.succeed('429')),
        ),
    );
  }).pipe(
    Effect.scoped,
    Effect.provide(
      Rpc.inProcess.client(Api, Layer.merge(Handlers, RateLimitLive)),
    ),
    Effect.runPromise,
  );

  expect(RateLimit.get(Api.requests.get('Search')!)).toEqual(Option.some(2));
  expect(RateLimit.get(Api.requests.get('List')!)).toEqual(Option.some(100));
  expect(results).toEqual(['found', 'found', '429', 'listed']);
});
