import { Effect } from 'effect';
import { StoryContext, type Story } from 'laymos/story';
import { describe, expect, it } from 'vitest';
import { aUserUpdatedSomeTimeBack } from './catching-up/a-user-updated-some-time-back.story.js';
import { aBrowserMountsAQuery } from './building-the-simulation/a-browser-mounts-a-query.story.js';
import { issue1 } from './tests/issue-1.story.js';
import { crossCollection } from './optimistic-transactions/cross-collection.story.js';
import { peerSyncModel } from './two-tabs/peer-sync-model.story.js';
import { oneListAtATime } from './syncing-on-demand/one-list-at-a-time.story.js';
import { editsKeepFlowing } from './catching-up/edits-keep-flowing.story.js';
import { oneBrowserManyTabs } from './two-tabs/one-browser-many-tabs.story.js';
import { fromDatabaseToCollection } from './wiring-a-collection/from-database-to-collection.story.js';
import { oneReaderManyTabs } from './leadership/one-reader-many-tabs.story.js';
import { yieldingLeadership } from './leadership/yielding-leadership.story.js';
import { leadershipIsNotACache } from './leadership/leadership-is-not-a-cache.story.js';

const stories: readonly Story[] = [
  aBrowserMountsAQuery,
  fromDatabaseToCollection,
  aUserUpdatedSomeTimeBack,
  editsKeepFlowing,
  oneListAtATime,
  crossCollection,
  peerSyncModel,
  oneBrowserManyTabs,
  oneReaderManyTabs,
  yieldingLeadership,
  leadershipIsNotACache,
  issue1,
];

describe('Sync story simulation', () => {
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
