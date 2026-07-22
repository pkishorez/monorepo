import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { flow, terminal } from 'laymos/story';

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
  (_input: {}) =>
    Effect.gen(function* () {
      const result = yield* harness.settings.reset();
      return yield* terminal(
        'Return the reset singleton',
        {
          description: 'Completes this reset flow with the configured default.',
          completion: { kind: 'success' },
        },
        Effect.succeed(result),
      );
    }),
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
