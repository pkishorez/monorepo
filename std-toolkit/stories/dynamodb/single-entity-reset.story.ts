import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { flow } from 'laymos/story';

import { dynamodbSingleEntityStories } from './support/story-groups.js';

import {
  assertNonEmptyCursor,
  makeDynamoStoryHarness,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('single-entity-reset');
const resetSettings = flow(
  'Reset single entity',
  {
    description:
      'Writes the configured default through the public singleton reset flow.',
  },
  (_input: {}) => harness.settings.reset(),
);

dynamodbSingleEntityStories
  .story('Reset single entity', {
    description:
      'Shows resetting persisted singleton state to its configured default.',
  })
  .provide(harness.layer)
  .execute(resetSettings)
  .scenario(
    'reset persists the schema default with a real cursor',
    { description: 'Replaces prepared settings with defaults.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(
            {},
            harness.settings.put({ theme: 'dark', retries: 8 }),
          ),
        )
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.value.theme, 'light');
            assert.equal(result.value.retries, 3);
            assertNonEmptyCursor(result.meta._u);
          }),
        )
        .cleanup(harness.cleanup),
  );
