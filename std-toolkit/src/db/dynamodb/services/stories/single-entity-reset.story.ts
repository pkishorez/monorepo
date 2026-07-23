import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { story } from 'laymos/story';

import { dynamodbStoryDocumentation } from './story-documentation.js';

import {
  assertNonEmptyCursor,
  makeDynamoStoryHarness,
} from './dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('single-entity-reset');

story('Reset single entity', {
  description:
    'Shows resetting persisted singleton state to its configured default.',
  documentation: dynamodbStoryDocumentation.singleReset,
})
  .provide(harness.layer)
  .execute((_input: {}) => harness.settings.reset())
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
