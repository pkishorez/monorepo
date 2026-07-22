import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbSingleEntityStories } from './support/story-groups.js';

import {
  assertNonEmptyCursor,
  makeDynamoStoryHarness,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('single-entity-get-and-update');
type Input = {
  readonly update: Parameters<typeof harness.settings.getAndUpdate>[0];
  readonly beforeCursor?: string;
};
const getAndUpdateSettings = functionBlock(
  'Get and update application settings',
  {
    description:
      'Runs one read-modify-write through the public singleton flow.',
  },
  (input: Input) => harness.settings.getAndUpdate(input.update),
);

dynamodbSingleEntityStories
  .story('Get and update', {
    description:
      'Shows write and intentional no-op paths for singleton read-modify-write.',
  })
  .provide(harness.layer)
  .execute(getAndUpdateSettings)
  .scenario(
    'derived update treats the default as current state',
    { description: 'Creates the first stored record from the default.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>({
            update: (current) => ({ retries: current.retries + 1 }),
          }),
        )
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.value.retries, 4);
            assertNonEmptyCursor(result.meta._u);
          }),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'null callback preserves stored state',
    { description: 'Skips persistence when the callback returns null.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(undefined).pipe(
            Effect.andThen(harness.settings.put({ theme: 'dark', retries: 6 })),
            Effect.map(
              (before) =>
                ({
                  update: () => null,
                  beforeCursor: before.meta._u,
                }) satisfies Input,
            ),
          ),
        )
        .verify((result, prepared) =>
          Effect.sync(() =>
            assert.equal(result.meta._u, prepared.beforeCursor),
          ),
        )
        .cleanup(harness.cleanup),
  );
