import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { story } from 'laymos/story';

import { dynamodbStoryDocumentation } from './story-documentation.js';

import { makeDynamoStoryHarness } from './dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('single-entity-get');

story('Get single entity', {
  description:
    'Shows default and persisted paths for reading one logical singleton.',
  documentation: dynamodbStoryDocumentation.singleGet,
})
  .provide(harness.layer)
  .execute((_input: {}) => harness.settings.get())
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
