import { Deferred, Effect, Fiber, Stream } from 'effect';
import { PeerId, WebRtc } from 'effect-webrtc';
import { Story } from 'laymos/story';
import { Activity, memoryWebRtc } from '../support.js';

export const stoppingWorkEarly = Story.make({
  title: 'Stopping work early',
  description: 'Cancel a streaming RPC without affecting the peer session.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What does the Flow show when Alice stops watching?', {
      answer:
        'Interrupting Alice’s stream sends cancellation to Bob and ends that RPC Flow as interrupted. The peer connection remains a separate concern and is not treated as a failed invocation.',
      proof: Story.flow(
        Effect.scoped(
          Effect.gen(function* () {
            const started = yield* Deferred.make<void>();
            const bobId = PeerId.make('stopping-bob');
            yield* WebRtc.make({
              id: bobId,
              serve: {
                contract: Activity,
                handlers: Activity.toLayer({
                  WatchActivity: () =>
                    Stream.unwrap(
                      Deferred.succeed(started, undefined).pipe(
                        Effect.as(Stream.never),
                      ),
                    ),
                }),
              },
            });
            const alice = yield* WebRtc.make({
              id: PeerId.make('stopping-alice'),
            });
            const bob = yield* alice.connect({
              id: bobId,
              contract: Activity,
            });

            let stopped = false;
            const watching = yield* bob.rpc.WatchActivity().pipe(
              Stream.runDrain,
              Effect.ensuring(
                Effect.sync(() => {
                  stopped = true;
                }),
              ),
              Effect.forkChild,
            );
            yield* Deferred.await(started);
            yield* Fiber.interrupt(watching);

            yield* Story.assert('Alice can stop the active stream', stopped);
            return { activity: 'cancelled', peer: bob.remoteId };
          }),
        ).pipe(Effect.provide(memoryWebRtc)),
        { mergeRelated: true },
      ),
    }),
  ],
});
