import { strict as assert } from 'node:assert';

import { Effect, Schema } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbEntityStories } from './support/story-groups.js';

import { EntityESchema } from '../../src/eschema/index.js';
import { DynamoTable } from '../../src/db/dynamodb/index.js';
import {
  assertDynamoError,
  makeDynamoStoryHarness,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-auto-migration');
const oldTable = DynamoTable.make().primary('pk', 'sk').build();
const currentTable = DynamoTable.make().primary('pk', 'sk').build();
const oldSchema = EntityESchema.make('StoryProfile', 'profileId', {
  theme: Schema.String,
}).build();
const currentSchema = EntityESchema.make('StoryProfile', 'profileId', {
  theme: Schema.String,
})
  .evolve('v2', { fontSize: Schema.Number }, (previous) => ({
    ...previous,
    fontSize: 14,
  }))
  .build();
const oldProfiles = oldTable
  .entity(oldSchema)
  .primary({ pk: ['profileId'] })
  .build();
const currentProfiles = currentTable
  .entity(currentSchema)
  .primary({ pk: ['profileId'] })
  .build();

type Input = Parameters<typeof currentProfiles.update>[1];

const updateProfile = functionBlock(
  'Update an evolving profile',
  {
    description:
      'Updates a stale entity through its current schema and applies the configured migration policy.',
    attributes: (input: Input) => ({
      autoMigrate: input.autoMigrate ?? true,
      conditional: input.condition !== undefined,
    }),
  },
  (input: Input) => currentProfiles.update({ profileId: 'target' }, input),
);

dynamodbEntityStories
  .story('Auto-migrate entities', {
    description:
      'Shows how updates treat stale schema versions with migration enabled, disabled, or followed by a failed condition.',
  })
  .provide(harness.layer)
  .execute(updateProfile)
  .scenario(
    'update migrates stale data before applying changes',
    {
      description:
        'Reads a v1 profile, supplies the v2 default, and applies the requested update.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(
            { update: { theme: 'dark' } },
            oldProfiles.insert({ profileId: 'target', theme: 'light' }),
          ),
        )
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.value.theme, 'dark');
            assert.equal(result.value.fontSize, 14);
            assert.equal(result.meta._v, 'v2');
          }),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'disabled migration returns ItemVersionMismatch',
    {
      description:
        'Refuses to rewrite a stale profile when autoMigrate is false.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(
            { update: { theme: 'dark' }, autoMigrate: false },
            oldProfiles.insert({ profileId: 'target', theme: 'light' }),
          ),
        )
        .verifyError((error) => assertDynamoError(error, 'ItemVersionMismatch'))
        .cleanup(harness.cleanup),
  )
  .scenario(
    'failed user condition still leaves the stale entity migrated',
    {
      description:
        'Completes canonical migration before rejecting the requested conditional update.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(
            {
              update: { theme: 'dark' },
              condition: ($: any) => $.cond('theme', '=', 'missing'),
            },
            oldProfiles.insert({ profileId: 'target', theme: 'light' }),
          ),
        )
        .verifyError((error) =>
          assertDynamoError(error, 'ConditionCheckFailed').pipe(
            Effect.andThen(currentProfiles.get({ profileId: 'target' })),
            Effect.tap((stored) =>
              Effect.sync(() => {
                assert.equal(stored?.value.theme, 'light');
                assert.equal(stored?.value.fontSize, 14);
                assert.equal(stored?.meta._v, 'v2');
              }),
            ),
          ),
        )
        .cleanup(harness.cleanup),
  );
