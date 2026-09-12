import { Effect, Layer, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { describe, expect, it } from 'vitest';
import { PeerId, WebRtc } from '../src/effect-webrtc/index.js';
import { layer as memoryPlatform } from '../src/platform/memory/index.js';
import { layer as memorySignaling } from '../src/signaling/memory/index.js';

describe('Peer orchestration', () => {
  it('negotiates one session and carries Effect RPC', async () => {
    const Greet = Rpc.make('Greet', {
      payload: { name: Schema.String },
      success: Schema.String,
    });
    const Api = RpcGroup.make(Greet);
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* WebRtc.make({
            id: PeerId.make('bob'),
            provides: {
              group: Api,
              handlers: Api.toLayer({
                Greet: ({ name }) => Effect.succeed(`Hello, ${name}`),
              }),
            },
          });
          const alice = yield* WebRtc.make({ id: PeerId.make('alice') });
          const bob = yield* alice.connect({
            id: PeerId.make('bob'),
            consumes: Api,
          });
          return yield* bob.rpc.Greet({ name: 'Ada' });
        }),
      ).pipe(Effect.provide(Layer.merge(memorySignaling, memoryPlatform))),
    );

    expect(result).toBe('Hello, Ada');
  });
});
