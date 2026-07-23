import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { story } from 'laymos/story';

import { dynamodbStoryDocumentation } from './story-documentation.js';

import {
  assertDynamoError,
  makeDynamoStoryHarness,
} from './dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('single-entity-update');
type Input = Parameters<typeof harness.settings.update>[0];

story('Update single entity', {
  description:
    'Shows successful and missing-record paths for one singleton update.',
  documentation: dynamodbStoryDocumentation.singleUpdate,
})
  .provide(harness.layer)
  .execute((input: Input) => harness.settings.update(input))
  .scenario(
    'update changes an existing singleton',
    { description: 'Applies a partial update to prepared settings.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>(
            { update: { theme: 'dark' } },
            harness.settings.put({ theme: 'light', retries: 7 }),
          ),
        )
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.value.theme, 'dark');
            assert.equal(result.value.retries, 7);
          }),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'update before the first write returns NoItemToUpdate',
    { description: 'Runs the same update without persisted settings.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare<Input>({ update: { theme: 'dark' } }))
        .verifyError((error) => assertDynamoError(error, 'NoItemToUpdate'))
        .cleanup(harness.cleanup),
  );
