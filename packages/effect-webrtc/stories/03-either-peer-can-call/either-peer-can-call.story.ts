import { Effect } from 'effect';
import { PeerId, WebRtc } from 'effect-webrtc';
import { Story } from 'laymos/story';
import { memoryWebRtc, profileHandlers, Profiles } from '../support.js';

export const eitherPeerCanCall = Story.make({
  title: 'Either peer can call',
  description: 'Let either side initiate a session and call a remote RPC.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Does Alice always have to start the connection?', {
      answer:
        'No. Here Alice provides the same profile API as before, but Bob initiates the session and calls her. The Flow follows the direction the peers actually use rather than assigning permanent client and server roles.',
      proof: Story.flow(
        Effect.scoped(
          Effect.gen(function* () {
            const aliceId = PeerId.make('either-side-alice');
            yield* WebRtc.make({
              id: aliceId,
              provides: {
                group: Profiles,
                handlers: profileHandlers('Alice'),
              },
            });
            const bob = yield* WebRtc.make({
              id: PeerId.make('either-side-bob'),
            });

            const alice = yield* bob.connect({
              id: aliceId,
              consumes: Profiles,
            });
            const profile = yield* alice.rpc.GetProfile({});

            yield* Story.assert(
              'Bob can initiate and call Alice',
              profile.name === 'Alice' && profile.status === 'online',
            );
            return profile;
          }),
        ).pipe(Effect.provide(memoryWebRtc)),
        { mergeRelated: true },
      ),
    }),
  ],
});
