import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { story } from 'laymos/story';

import { dynamodbStoryDocumentation } from './story-documentation.js';

import {
  assertNonEmptyCursor,
  makeDynamoStoryHarness,
} from './dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('single-entity-put');
type Input = Parameters<typeof harness.settings.put>[0];

story('Put single entity', {
  description: 'Shows the unconditional write path for one logical singleton.',
  documentation: dynamodbStoryDocumentation.singlePut,
})
  .provide(harness.layer)
  .execute((input: Input) => harness.settings.put(input))
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
