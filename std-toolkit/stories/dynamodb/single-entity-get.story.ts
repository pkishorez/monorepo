import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { flow } from 'laymos/story';

import { dynamodbSingleEntityStories } from './support/story-groups.js';

import { makeDynamoStoryHarness } from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('single-entity-get');
const getSettings = flow(
  'Get single entity',
  {
    description:
      'Reads the singleton record or returns its configured default before the first write.',
  },
  (_input: {}) => harness.settings.get(),
);

dynamodbSingleEntityStories
  .story('Get single entity', {
    description:
      'Shows default and persisted paths for reading one logical singleton.',
  })
  .provide(harness.layer)
  .execute(getSettings)
  .scenario(
    'get returns the schema default before the first write',
    { description: 'Reads synthetic default state and its sentinel cursor.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare({}))
        .verify((result) =>
          Effect.sync(() => {
            assert.deepEqual(result.value, { theme: 'light', retries: 3 });
            assert.equal(result.meta._u, '');
          }),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'get returns persisted settings after a write',
    {
      description: 'Reads a prepared stored singleton instead of its default.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(
            {},
            harness.settings.put({ theme: 'dark', retries: 5 }),
          ),
        )
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.value.theme, 'dark');
            assert.equal(result.value.retries, 5);
          }),
        )
        .cleanup(harness.cleanup),
  );
