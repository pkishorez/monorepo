import { Effect, Option, Stream } from 'effect';
import { PeerId, WebRtc } from 'effect-webrtc';
import { Story } from 'laymos/story';
import { memoryWebRtc } from '../support.js';

export const meetingAnotherPeer = Story.make({
  title: 'Meeting another peer',
  description:
    'Create two peers and establish a direct session without adding RPC.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Can Alice connect directly to Bob?', {
      answer:
        'Yes. Bob only needs to be online through the same signaling provider. Alice receives a session after the in-memory RTC connection is ready, and the Flow shows both peers negotiating it.',
      proof: Story.flow(
        Effect.scoped(
          Effect.gen(function* () {
            const bobId = PeerId.make('meeting-bob');
            yield* WebRtc.make({ id: bobId });
            const alice = yield* WebRtc.make({
              id: PeerId.make('meeting-alice'),
            });

            const bob = yield* alice.connect({ id: bobId });
            const status = Option.getOrUndefined(
              yield* Stream.runHead(bob.status),
            );

            yield* Story.assert(
              'Alice has a connected session with Bob',
              bob.remoteId === bobId && status?._tag === 'Connected',
            );
            return { remotePeer: bob.remoteId, status };
          }),
        ).pipe(Effect.provide(memoryWebRtc)),
        { mergeRelated: true },
      ),
    }),
  ],
});
