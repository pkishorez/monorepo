import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbEntityStories } from './support/story-groups.js';

import {
  makeDynamoStoryHarness,
  user,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-read');

const readUser = functionBlock(
  'Read a user',
  {
    description:
      'Reads a keyed entity through the public service with an optional strongly consistent read.',
    attributes: (input: {
      readonly userId: string;
      readonly consistent: boolean;
    }) => input,
  },
  (input: { readonly userId: string; readonly consistent: boolean }) =>
    harness.users.get(
      { organizationId: 'org-1', userId: input.userId },
      { ConsistentRead: input.consistent },
    ),
);

dynamodbEntityStories
  .story('Read an entity', {
    description:
      'Shows the observable results of reading present and absent keyed entities.',
  })
  .provide(harness.layer)
  .execute(readUser)
  .scenario(
    'get returns the decoded stored entity',
    { description: 'Reads a seeded user using a strongly consistent request.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(
            { userId: 'present', consistent: true },
            harness.users.insert(user('present')),
          ),
        )
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result?.value.userId, 'present');
            assert.equal(result?.value.name, 'User present');
          }),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'get returns null when the entity is absent',
    { description: 'Reads an identity that has never been stored.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare({ userId: 'missing', consistent: false }),
        )
        .verify((result) => Effect.sync(() => assert.equal(result, null)))
        .cleanup(harness.cleanup),
  );
