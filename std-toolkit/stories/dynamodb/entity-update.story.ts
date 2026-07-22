import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbEntityStories } from './support/story-groups.js';

import { exprCondition } from '../../src/db/dynamodb/index.js';
import {
  assertDynamoError,
  makeDynamoStoryHarness,
  user,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-update');

type Input = {
  readonly params: Parameters<typeof harness.users.update>[1];
  readonly beforeCursor?: string;
};
const key = { organizationId: 'org-1', userId: 'target' };

const updateUser = functionBlock<[Input], any, any, any>(
  'Update a user',
  {
    description:
      'Updates a keyed entity with either a partial value or DynamoDB expression while enforcing public guards.',
    attributes: (input: Input) => ({
      form:
        typeof input.params.update === 'function' ? 'expression' : 'partial',
      conditional: input.params.condition !== undefined,
    }),
  },
  (input: Input) => harness.users.update(key, input.params),
);

dynamodbEntityStories
  .story('Update an entity', {
    description:
      'Shows partial and expression updates together with the guards that reject invalid writes.',
  })
  .provide(harness.layer)
  .execute(updateUser)
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
            assert.ok(result.meta._u > prepared.beforeCursor!);
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
          harness.prepare<Input>({ params: { update: { name: 'Missing' } } }),
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
  );
