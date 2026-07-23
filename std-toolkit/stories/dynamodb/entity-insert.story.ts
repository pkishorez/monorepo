import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { flow, terminal } from 'laymos/story';

import { dynamodbEntityStories } from './support/story-groups.js';

import {
  assertDynamoError,
  assertNonEmptyCursor,
  makeDynamoStoryHarness,
  user,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-insert');
type Input = Parameters<typeof harness.users.insert>[0];

const insertUser = flow(
  'Insert entity',
  {
    description:
      'Inserts one keyed entity and returns its persisted value and DynamoDB metadata.',
  },
  (input: Input) =>
    Effect.gen(function* () {
      const result = yield* harness.users.insert(input);
      return yield* terminal(
        'Return the inserted entity',
        {
          description: 'Completes this insert flow with the persisted entity.',
          completion: { kind: 'success' },
        },
        () => Effect.succeed(result),
      );
    }),
);

dynamodbEntityStories
  .story('Insert entity', {
    description:
      'Shows every feasible outcome of inserting one keyed DynamoDB entity.',
  })
  .provide(harness.layer)
  .execute(insertUser)
  .scenario(
    'insert returns the stored user with fresh metadata',
    { description: 'Inserts a new identity into an empty table.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare(user('one')))
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.value.userId, 'one');
            assert.equal(result.meta._e, 'StoryUser');
            assert.equal(result.meta._d, false);
            assertNonEmptyCursor(result.meta._u);
          }),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'duplicate identity returns ItemAlreadyExists',
    {
      description:
        'Prepares an existing identity, then attempts the one narrated insert.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(
            user('duplicate'),
            harness.users.insert(user('duplicate')),
          ),
        )
        .verifyError((error) => assertDynamoError(error, 'ItemAlreadyExists'))
        .cleanup(harness.cleanup),
  );
