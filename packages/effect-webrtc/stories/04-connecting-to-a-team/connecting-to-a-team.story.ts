import { Effect, Stream } from 'effect';
import { PeerId, WebRtc } from 'effect-webrtc';
import { Story } from 'laymos/story';
import { memoryWebRtc, profileHandlers, Profiles } from '../support.js';

export const connectingToATeam = Story.make({
  title: 'Connecting to a team',
  description: 'Maintain independent sessions with more than one peer.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Can Alice talk to Bob and Carol independently?', {
      answer:
        'Yes. Alice opens one session per remote peer. Each session has its own connection Flow and typed RPC client, so activity with Bob does not become part of Carol’s connection.',
      proof: Story.flow(
        Effect.scoped(
          Effect.gen(function* () {
            const bobId = PeerId.make('team-bob');
            const carolId = PeerId.make('team-carol');
            yield* WebRtc.make({
              id: bobId,
              serve: {
                contract: Profiles,
                handlers: profileHandlers('Bob'),
              },
            });
            yield* WebRtc.make({
              id: carolId,
              serve: {
                contract: Profiles,
                handlers: profileHandlers('Carol'),
              },
            });
            const alice = yield* WebRtc.make({
              id: PeerId.make('team-alice'),
            });

            const [bob, carol] = yield* Effect.all(
              [
                alice.connect({ id: bobId, contract: Profiles }),
                alice.connect({ id: carolId, contract: Profiles }),
              ],
              { concurrency: 'unbounded' },
            );
            const [bobProfile, carolProfile] = yield* Effect.all(
              [bob.rpc.GetProfile({}), carol.rpc.GetProfile({})],
              { concurrency: 'unbounded' },
            );
            const sessions = yield* Stream.runHead(alice.sessions);

            yield* Story.assert(
              'Alice has one working session per teammate',
              sessions._tag === 'Some' &&
                sessions.value.length === 2 &&
                bobProfile.name === 'Bob' &&
                carolProfile.name === 'Carol',
            );
            return {
              connectedTo:
                sessions._tag === 'Some'
                  ? sessions.value.map(({ remoteId }) => remoteId)
                  : [],
              profiles: [bobProfile, carolProfile],
            };
          }),
        ).pipe(Effect.provide(memoryWebRtc)),
        { mergeRelated: true },
      ),
    }),
  ],
});
