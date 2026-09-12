import { describe, expect, it } from 'vitest';
import { Effect, Fiber, Option, Stream } from 'effect';
import {
  NegotiationMessage,
  PeerId,
  Signaling,
} from '../src/signaling/signaling.js';
import { layer as memorySignaling } from '../src/signaling/memory/index.js';
import { WebRtcPlatform } from '../src/platform/platform.js';
import { layer as memoryPlatform } from '../src/platform/memory/index.js';
import { startConnectionAttempt } from '../src/flow-tracing/index.js';

describe('contract adapters', () => {
  it('routes typed negotiation messages through memory signaling', async () => {
    const received = await Effect.runPromise(
      Effect.gen(function* () {
        const signaling = yield* Signaling;
        const alice = yield* signaling.open(PeerId.make('alice'));
        const bob = yield* signaling.open(PeerId.make('bob'));
        const incoming = yield* Stream.runHead(bob.incoming).pipe(
          Effect.forkScoped({ startImmediately: true }),
        );

        const attempt = yield* startConnectionAttempt({
          localPeerId: alice.peerId,
          remotePeerId: bob.peerId,
        });
        const envelope = yield* attempt.send(
          NegotiationMessage.make({
            _tag: 'Offer',
            description: 'test-offer',
          }),
        );
        yield* alice.send(bob.peerId, envelope);

        return Option.getOrThrow(yield* Fiber.join(incoming));
      }).pipe(Effect.scoped, Effect.provide(memorySignaling)),
    );

    expect(received).toEqual({
      sender: PeerId.make('alice'),
      envelope: expect.objectContaining({
        message: { _tag: 'Offer', description: 'test-offer' },
        connectionAttemptId: expect.any(String),
        peerSessionId: expect.any(String),
        flow: expect.objectContaining({
          flowId: expect.any(String),
          message: expect.objectContaining({
            from: 'peer:alice',
            to: 'peer:bob',
          }),
        }),
      }),
    });
  });

  it('pairs binary data channels through the memory platform', async () => {
    const received = await Effect.runPromise(
      Effect.gen(function* () {
        const platform = yield* WebRtcPlatform;
        const alice = yield* platform.makeConnection();
        const bob = yield* platform.makeConnection();

        const remoteChannel = yield* Stream.runHead(
          bob.incomingDataChannels,
        ).pipe(Effect.forkScoped({ startImmediately: true }));
        const localChannel = yield* alice.openDataChannel;

        const offer = yield* alice.createOffer();
        const answer = yield* bob.acceptOffer(offer);
        yield* alice.acceptAnswer(answer);

        const bobChannel = Option.getOrThrow(yield* Fiber.join(remoteChannel));
        const incoming = yield* Stream.runHead(bobChannel.incoming).pipe(
          Effect.forkScoped({ startImmediately: true }),
        );
        yield* localChannel.send(Uint8Array.from([1, 2, 3]));

        return Option.getOrThrow(yield* Fiber.join(incoming));
      }).pipe(Effect.scoped, Effect.provide(memoryPlatform)),
    );

    expect(received).toEqual(Uint8Array.from([1, 2, 3]));
  });
});
