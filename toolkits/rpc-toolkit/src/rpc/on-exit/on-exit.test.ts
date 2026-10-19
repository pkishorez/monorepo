import { Effect, Exit, Layer, Schema, Stream } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { Rpc, RpcClient, RpcGroup, RpcMiddleware } from 'effect/rpc';
import { describe, expect, it } from 'vitest';

import { client as httpClient, server as httpServer } from '../http/index.ts';
import { client as inProcessClient } from '../in-process/index.ts';
import { onExit } from './index.ts';

class NotFound extends Schema.Error<NotFound>('test/NotFound')({
  _tag: Schema.tag('NotFound'),
  id: Schema.String,
}) {}

class Watch extends RpcMiddleware.Service<Watch>()('test/Watch', {
  requiredForClient: true,
}) {}

const Api = RpcGroup.make(
  Rpc.make('Get', {
    payload: { id: Schema.String },
    success: Schema.String,
    error: NotFound,
  }),
  Rpc.make('Count', {
    payload: { to: Schema.Number },
    success: Schema.Number,
    stream: true,
  }),
).middleware(Watch);

const Handlers = Api.toLayer({
  Get: ({ id }) =>
    id === 'a' ? Effect.succeed('found a') : Effect.fail(new NotFound({ id })),
  Count: ({ to }) => Stream.range(1, to),
});
const WatchLive = Layer.succeed(Watch)((effect) => effect);

/** A Client Implementation that records every answer it sends for. */
const watching = () => {
  const seen: Array<Exit.Exit<unknown, unknown>> = [];
  const layer = RpcMiddleware.layerClient(Watch, ({ request, next }) =>
    next(request).pipe(
      onExit((exit) => Effect.sync(() => void seen.push(exit))),
    ),
  );
  return { seen, layer };
};

const calls = Effect.gen(function* () {
  const api = yield* RpcClient.make(Api);
  const found = yield* api.Get({ id: 'a' });
  const missing = yield* Effect.flip(api.Get({ id: 'b' }));
  const counted = yield* Stream.runCollect(api.Count({ to: 2 }));
  return { found, missing, counted: Array.from(counted) };
});

describe('Rpc.onExit', () => {
  it('tells a Client Implementation how each call ended, in process', async () => {
    const { seen, layer } = watching();
    const result = await calls.pipe(
      Effect.scoped,
      Effect.provide(
        Layer.merge(
          inProcessClient(Api, Layer.merge(Handlers, WatchLive)),
          layer,
        ),
      ),
      Effect.runPromise,
    );

    expect(result).toEqual({
      found: 'found a',
      missing: new NotFound({ id: 'b' }),
      counted: [1, 2],
    });
    expect(seen).toHaveLength(3);
    expect(seen[0]).toEqual(Exit.succeed('found a'));
    expect(Exit.findErrorOption(seen[1]!)).toMatchObject({
      value: { _tag: 'NotFound', id: 'b' },
    });
    expect(Exit.isSuccess(seen[2]!)).toBe(true);
  });

  it('decodes the answer over http', async () => {
    const answer = httpServer(Api, Layer.merge(Handlers, WatchLive));
    const fetch = (input: RequestInfo | URL, init?: RequestInit) =>
      answer(new Request(input, init));
    const { seen, layer } = watching();
    await calls.pipe(
      Effect.scoped,
      Effect.provide(
        Layer.merge(httpClient(Api, { url: 'https://api.test/rpc' }), layer),
      ),
      Effect.provideService(
        FetchHttpClient.Fetch,
        fetch as typeof globalThis.fetch,
      ),
      Effect.runPromise,
    );

    expect(seen).toHaveLength(3);
    const error = Exit.findErrorOption(seen[1]!);
    expect(error).toMatchObject({ value: { _tag: 'NotFound', id: 'b' } });
    expect(error._tag === 'Some' && error.value instanceof NotFound).toBe(true);
  });
});
