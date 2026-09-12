import { Effect } from 'effect';
import { PeerId, WebRtc } from 'effect-webrtc';
import { Story } from 'laymos/story';
import { memoryWebRtc, profileHandlers, Profiles } from '../support.js';

export const askingAPeer = Story.make({
  title: 'Asking a peer',
  description: 'Call a typed RPC provided by a connected peer.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Can Alice call Bob after connecting?', {
      answer:
        'Yes. Bob declares the RPC group he provides, while Alice names the same group when connecting. The result stays typed, and its Flow is recorded separately beneath the connection attempt.',
      proof: Story.flow(
        Effect.scoped(
          Effect.gen(function* () {
            const bobId = PeerId.make('asking-bob');
            yield* WebRtc.make({
              id: bobId,
              provides: {
                group: Profiles,
                handlers: profileHandlers('Bob'),
              },
            });
            const alice = yield* WebRtc.make({
              id: PeerId.make('asking-alice'),
            });

            const bob = yield* alice.connect({
              id: bobId,
              consumes: Profiles,
            });
            const profile = yield* bob.rpc.GetProfile({});

            yield* Story.assert(
              'Bob answers with his profile',
              profile.name === 'Bob' && profile.status === 'online',
            );
            return profile;
          }),
        ).pipe(Effect.provide(memoryWebRtc)),
        { mergeRelated: true },
      ),
    }),
  ],
});
