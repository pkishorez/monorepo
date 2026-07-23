import { strict as assert } from 'node:assert';

import { Effect, Schema } from 'effect';
import { story } from 'laymos/story';

import { dynamodbStoryDocumentation } from './story-documentation.js';

import { EntityESchema } from '../../../../eschema/index.js';
import { DynamoTable, exprCondition } from '../../index.js';
import {
  assertDynamoError,
  makeDynamoStoryHarness,
  user,
} from './dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-update');

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
const oldProfiles = DynamoTable.make()
  .primary('pk', 'sk')
  .build()
  .entity(oldSchema)
  .primary({ pk: ['profileId'] })
  .build();
const currentProfiles = DynamoTable.make()
  .primary('pk', 'sk')
  .build()
  .entity(currentSchema)
  .primary({ pk: ['profileId'] })
  .build();

type Input =
  | {
      readonly kind: 'standard';
      readonly params: Parameters<typeof harness.users.update>[1];
      readonly beforeCursor?: string;
    }
  | {
      readonly kind: 'evolving';
      readonly params: Parameters<typeof currentProfiles.update>[1];
    };
const key = { organizationId: 'org-1', userId: 'target' };

story('Update entity', {
  description:
    'Shows partial and expression updates together with the guards that reject invalid writes.',
  documentation: dynamodbStoryDocumentation.update,
})
  .provide(harness.layer)
  .execute(
    (input: Input): Effect.Effect<any, any, any> =>
      input.kind === 'standard'
        ? harness.users.update(key, input.params)
        : currentProfiles.update({ profileId: 'target' }, input.params),
  )
  .scenario(
    'partial update changes requested fields and advances the cursor',
    {
      description:
        'Changes one field without replacing the remaining entity value.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(undefined).pipe(
            Effect.andThen(harness.users.insert(user('target'))),
            Effect.map(
              (before) =>
                ({
                  kind: 'standard',
                  params: { update: { name: 'Updated' } },
                  beforeCursor: before.meta._u,
                }) satisfies Input,
            ),
          ),
        )
        .verify((result, prepared) =>
          Effect.sync(() => {
            assert.equal(result.value.name, 'Updated');
            assert.equal(result.value.email, 'target@example.com');
            assert.ok(
              result.meta._u >
                (prepared as Extract<Input, { kind: 'standard' }>)
                  .beforeCursor!,
            );
          }),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'expression update increments numbers and appends lists',
    {
      description:
        'Uses the public update expression builder on two field types.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>(
            {
              kind: 'standard',
              params: {
                update: ($) => [
                  $.set('score', $.opAdd('score', 5)),
                  $.append('tags', ['returning']),
                ],
              },
            },
            harness.users.insert(user('target')),
          ),
        )
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.value.score, 15);
            assert.deepEqual(result.value.tags, ['new', 'returning']);
          }),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'missing update returns NoItemToUpdate',
    { description: 'Attempts to update an identity that is not stored.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>({
            kind: 'standard',
            params: { update: { name: 'Missing' } },
          }),
        )
        .verifyError((error) => assertDynamoError(error, 'NoItemToUpdate'))
        .cleanup(harness.cleanup),
  )
  .scenario(
    'failed custom condition returns ConditionCheckFailed',
    {
      description:
        'Rejects an update whose explicit business condition is false.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>(
            {
              kind: 'standard',
              params: {
                update: { name: 'Blocked' },
                condition: exprCondition(($) =>
                  $.cond('status', '=', 'inactive'),
                ),
              },
            },
            harness.users.insert(user('target')),
          ),
        )
        .verifyError((error) =>
          assertDynamoError(error, 'ConditionCheckFailed'),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'stale entity migrates before applying its update',
    {
      description:
        'Reads v1 data, applies the v2 migration, and then writes the requested change.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>(
            { kind: 'evolving', params: { update: { theme: 'dark' } } },
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
    'disabled migration rejects stale schema data',
    {
      description:
        'Returns ItemVersionMismatch when automatic migration is disabled.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>(
            {
              kind: 'evolving',
              params: { update: { theme: 'dark' }, autoMigrate: false },
            },
            oldProfiles.insert({ profileId: 'target', theme: 'light' }),
          ),
        )
        .verifyError((error) => assertDynamoError(error, 'ItemVersionMismatch'))
        .cleanup(harness.cleanup),
  )
  .scenario(
    'failed condition leaves stale data canonically migrated',
    {
      description:
        'Persists schema migration before reporting the rejected business condition.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>(
            {
              kind: 'evolving',
              params: {
                update: { theme: 'dark' },
                condition: ($: any) => $.cond('theme', '=', 'missing'),
              },
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
