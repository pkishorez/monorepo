import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbSingleEntityStories } from './support/story-groups.js';

import {
  assertDynamoError,
  makeDynamoStoryHarness,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('single-entity-update');
type Input = Parameters<typeof harness.settings.update>[0];
const updateSettings = functionBlock(
  'Update application settings',
  {
    description:
      'Updates the stored settings record through the public singleton update flow.',
  },
  (input: Input) => harness.settings.update(input),
);

dynamodbSingleEntityStories
  .story('Update', {
    description:
      'Shows successful and missing-record paths for one singleton update.',
  })
  .provide(harness.layer)
  .execute(updateSettings)
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
