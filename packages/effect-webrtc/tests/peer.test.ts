import { Deferred, Effect, Layer, Schema } from 'effect';
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
            serve: {
              contract: Api,
              handlers: Api.toLayer({
                Greet: ({ name }) => Effect.succeed(`Hello, ${name}`),
              }),
            },
          });
          const alice = yield* WebRtc.make({ id: PeerId.make('alice') });
          const bob = yield* alice.connect({
            id: PeerId.make('bob'),
            contract: Api,
          });
          return yield* bob.rpc.Greet({ name: 'Ada' });
        }),
      ).pipe(Effect.provide(Layer.merge(memorySignaling, memoryPlatform))),
    );

    expect(result).toBe('Hello, Ada');
  });

  it('exposes a duplex Remote Peer to the answering Peer', async () => {
    const Greet = Rpc.make('Greet', {
      success: Schema.String,
    });
    const Api = RpcGroup.make(Greet);
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const aliceId = PeerId.make('alice');
          const bobId = PeerId.make('bob');
          const handler = (name: string) =>
            Api.toLayer({ Greet: () => Effect.succeed(`Hello from ${name}`) });
          const alice = yield* WebRtc.make({
            id: aliceId,
            serve: { contract: Api, handlers: handler('Alice') },
          });
          const bob = yield* WebRtc.make({
            id: bobId,
            serve: { contract: Api, handlers: handler('Bob') },
          });
          const observed = yield* Deferred.make<string>();
          yield* bob
            .onRemotePeer((remote) =>
              Deferred.succeed(observed, remote.remoteId).pipe(Effect.asVoid),
            )
            .pipe(Effect.forkScoped({ startImmediately: true }));

          const bobForAlice = yield* alice.connect({ id: bobId });
          const callbackId = yield* Deferred.await(observed);
          const aliceForBob = yield* bob.getRemotePeer({ id: aliceId });
          const sameAliceForBob = yield* bob.connect({ id: aliceId });
          const current = yield* bob.getCurrentRemotePeers();

          return {
            fromBob: yield* bobForAlice.rpc.Greet(),
            fromAlice: yield* aliceForBob.rpc.Greet(),
            reusedSession: sameAliceForBob === aliceForBob,
            callbackId,
            currentIds: current.map(({ remoteId }) => remoteId),
          };
        }),
      ).pipe(Effect.provide(Layer.merge(memorySignaling, memoryPlatform))),
    );

    expect(result).toEqual({
      fromBob: 'Hello from Bob',
      fromAlice: 'Hello from Alice',
      reusedSession: true,
      callbackId: 'alice',
      currentIds: ['alice'],
    });
  });
});
