import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { flow } from 'laymos/story';

import { dynamodbSingleEntityStories } from './support/story-groups.js';

import {
  assertNonEmptyCursor,
  makeDynamoStoryHarness,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('single-entity-put');
type Input = Parameters<typeof harness.settings.put>[0];
const putSettings = flow(
  'Put single entity',
  {
    description:
      'Writes one complete value through the public single-entity put method.',
  },
  (input: Input) => harness.settings.put(input),
);

dynamodbSingleEntityStories
  .story('Put single entity', {
    description:
      'Shows the unconditional write path for one logical singleton.',
  })
  .provide(harness.layer)
  .execute(putSettings)
  .scenario(
    'put persists a replacement with fresh metadata',
    { description: 'Stores the supplied settings value.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare({ theme: 'dark', retries: 5 }))
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.value.theme, 'dark');
            assertNonEmptyCursor(result.meta._u);
          }),
        )
        .cleanup(harness.cleanup),
  );
