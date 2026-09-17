import { Effect } from 'effect';
import { PeerId, WebRtc } from 'effect-webrtc';
import { Story } from 'laymos/story';
import { memoryWebRtc, profileHandlers, Profiles } from '../support.js';

export const doingWorkConcurrently = Story.make({
  title: 'Doing work concurrently',
  description: 'Run independent RPC invocations over one peer session.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens when Alice starts two calls together?', {
      answer:
        'Both calls share the established data channel, but each invocation receives its own child Flow. Their request, response, and outcome remain independently understandable.',
      proof: Story.flow(
        Effect.scoped(
          Effect.gen(function* () {
            const bobId = PeerId.make('concurrent-bob');
            yield* WebRtc.make({
              id: bobId,
              serve: {
                contract: Profiles,
                handlers: profileHandlers('Bob'),
              },
            });
            const alice = yield* WebRtc.make({
              id: PeerId.make('concurrent-alice'),
            });
            const bob = yield* alice.connect({
              id: bobId,
              contract: Profiles,
            });

            const profiles = yield* Effect.all(
              [bob.rpc.GetProfile({}), bob.rpc.GetProfile({})],
              { concurrency: 'unbounded' },
            );

            yield* Story.assert(
              'both calls complete independently',
              profiles.length === 2 &&
                profiles.every(({ name }) => name === 'Bob'),
            );
            return profiles;
          }),
        ).pipe(Effect.provide(memoryWebRtc)),
        { mergeRelated: true },
      ),
    }),
  ],
});
