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
        'No. Bob initiates one Peer Session, then both Peers get a typed Remote Peer and call each other. The Flow follows each RPC invocation rather than assigning permanent client and server roles.',
      proof: Story.flow(
        Effect.scoped(
          Effect.gen(function* () {
            const aliceId = PeerId.make('either-side-alice');
            const alice = yield* WebRtc.make({
              id: aliceId,
              serve: {
                contract: Profiles,
                handlers: profileHandlers('Alice'),
              },
            });
            const bob = yield* WebRtc.make({
              id: PeerId.make('either-side-bob'),
              serve: {
                contract: Profiles,
                handlers: profileHandlers('Bob'),
              },
            });

            const aliceForBob = yield* bob.connect({ id: aliceId });
            const bobForAlice = yield* alice.getRemotePeer({ id: bob.id });
            const [aliceProfile, bobProfile] = yield* Effect.all([
              aliceForBob.rpc.GetProfile({}),
              bobForAlice.rpc.GetProfile({}),
            ]);

            yield* Story.assert(
              'both Peers can call over Bob’s session',
              aliceProfile.name === 'Alice' && bobProfile.name === 'Bob',
            );
            return { aliceProfile, bobProfile };
          }),
        ).pipe(Effect.provide(memoryWebRtc)),
        { mergeRelated: true },
      ),
    }),
  ],
});
