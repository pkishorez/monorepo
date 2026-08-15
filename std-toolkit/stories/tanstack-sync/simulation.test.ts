import { Effect } from 'effect';
import { StoryContext, type Story } from 'laymos/story';
import { describe, expect, it } from 'vitest';
import { aUserUpdatedSomeTimeBack } from './catching-up/a-user-updated-some-time-back.story.js';
import { aSimulatedWorld } from './how-these-stories-run/a-simulated-world.story.js';
import { crossCollection } from './optimistic-transactions/cross-collection.story.js';
import { oneListAtATime } from './syncing-on-demand/one-list-at-a-time.story.js';
import { editsKeepFlowing } from './staying-current/edits-keep-flowing.story.js';
import { fromDatabaseToCollection } from './wiring-a-collection/from-database-to-collection.story.js';

const stories: readonly Story[] = [
  aSimulatedWorld,
  fromDatabaseToCollection,
  aUserUpdatedSomeTimeBack,
  editsKeepFlowing,
  oneListAtATime,
  crossCollection,
];

describe('TanStack Sync story simulation', () => {
  for (const story of stories) {
    describe(story.title, () => {
      for (const question of story.questions) {
        it(question.question, async () => {
          const assertions: string[] = [];
          await Effect.runPromise(
            question.proof.pipe(
              Effect.provideService(StoryContext, {
                beginSection: () => Effect.void,
                assert: (description, passed) =>
                  Effect.sync(() => {
                    expect(passed, description).toBe(true);
                    assertions.push(description);
                  }),
              }),
            ),
          );
          expect(assertions.length).toBeGreaterThan(0);
        });
      }
    });
  }
});
