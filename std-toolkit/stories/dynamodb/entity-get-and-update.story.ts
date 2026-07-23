import { strict as assert } from 'node:assert';

import { Effect } from 'effect';

import { dynamodbEntityStories } from './support/story-groups.js';

import {
  assertDynamoError,
  makeDynamoStoryHarness,
  user,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-get-and-update');

type Input = {
  readonly update: Parameters<typeof harness.users.getAndUpdate>[1];
  readonly beforeCursor?: string;
};
const key = { organizationId: 'org-1', userId: 'target' };

dynamodbEntityStories
  .story('Get and update entity', {
    description:
      'Shows guarded read-modify-write behavior, including derived updates and intentional no-ops.',
  })
  .provide(harness.layer)
  .execute((input: Input) => harness.users.getAndUpdate(key, input.update))
  .scenario(
    'callback derives the update from the current value',
    {
      description:
        'Reads a user and computes a partial update from that value.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>(
            {
              update: (current) => ({
                score: current.score + 1,
                name: `${current.name} updated`,
              }),
            },
            harness.users.insert(user('target')),
          ),
        )
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.value.score, 11);
            assert.equal(result.value.name, 'User target updated');
          }),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'null callback skips the write and preserves the cursor',
    {
      description:
        'Returns the current entity when the callback declines a write.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(undefined).pipe(
            Effect.andThen(harness.users.insert(user('target'))),
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
            assert.equal(result.meta._u, prepared.beforeCursor!),
          ),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'missing entity returns NoItemToUpdate',
    { description: 'Cannot derive an update without a current keyed entity.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare<Input>({ update: { score: 11 } }))
        .verifyError((error) => assertDynamoError(error, 'NoItemToUpdate'))
        .cleanup(harness.cleanup),
  )
  .scenario(
    'identity change returns IdUpdateNotSupported',
    {
      description:
        'Rejects a derived replacement that changes entity identity.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>(
            { update: { userId: 'other' } },
            harness.users.insert(user('target')),
          ),
        )
        .verifyError((error) =>
          assertDynamoError(error, 'IdUpdateNotSupported'),
        )
        .cleanup(harness.cleanup),
  );
