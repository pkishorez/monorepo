import { describe, expect, it } from 'vitest';
import { Effect, Fiber, Option, Stream } from 'effect';
import { WebRtcPlatform } from '../src/platform/platform.js';
import { layer } from '../src/platform/werift/index.js';

describe('werift platform', () => {
  it('connects two Node Peers over an RTC Data Channel', async () => {
    const received = await Effect.runPromise(
      Effect.gen(function* () {
        const platform = yield* WebRtcPlatform;
        const alice = yield* platform.makeConnection({ iceServers: [] });
        const bob = yield* platform.makeConnection({ iceServers: [] });
        yield* Stream.runForEach(alice.localIceCandidates, (candidate) =>
          bob.addIceCandidate(candidate),
        ).pipe(
          Effect.andThen(bob.completeIceCandidates),
          Effect.forkScoped({ startImmediately: true }),
        );
        yield* Stream.runForEach(bob.localIceCandidates, (candidate) =>
          alice.addIceCandidate(candidate),
        ).pipe(
          Effect.andThen(alice.completeIceCandidates),
          Effect.forkScoped({ startImmediately: true }),
        );
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
      }).pipe(Effect.scoped, Effect.provide(layer)),
    );

    expect(received).toEqual(Uint8Array.from([1, 2, 3]));
  });
});
