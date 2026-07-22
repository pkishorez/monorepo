import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { flow, terminal } from 'laymos/story';

import { dynamodbSingleEntityStories } from './support/story-groups.js';

import {
  assertDynamoError,
  makeDynamoStoryHarness,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('single-entity-update');
type Input = Parameters<typeof harness.settings.update>[0];
const updateSettings = flow(
  'Update single entity',
  {
    description:
      'Updates stored singleton state through the public single-entity update method.',
  },
  (input: Input) =>
    Effect.gen(function* () {
      const result = yield* harness.settings.update(input);
      return yield* terminal(
        'Return the updated singleton',
        {
          description: 'Completes this update flow with the changed singleton.',
          completion: { kind: 'success' },
        },
        Effect.succeed(result),
      );
    }),
);

dynamodbSingleEntityStories
  .story('Update single entity', {
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
