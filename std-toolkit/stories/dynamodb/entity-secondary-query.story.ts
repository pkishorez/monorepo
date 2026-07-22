import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbEntityStories } from './support/story-groups.js';

import {
  makeDynamoStoryHarness,
  user,
} from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-secondary-query');
type Input = { readonly status: 'active'; readonly emailPrefix: string };

const queryUsersByStatus = functionBlock(
  'Query users by status',
  {
    description:
      'Queries users through the configured status secondary index and custom sort key.',
  },
  (input: Input) =>
    harness.users.query('byStatus', {
      pk: { status: input.status },
      sk: { beginsWith: { email: input.emailPrefix } },
    }),
);

dynamodbEntityStories
  .story('Query a secondary index', {
    description:
      'Shows one complete entity query through a configured secondary index.',
  })
  .provide(harness.layer)
  .execute(queryUsersByStatus)
  .scenario(
    'secondary index derives and filters its custom sort key',
    { description: 'Returns active users matching the supplied email prefix.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>(
            { status: 'active', emailPrefix: 'active-' },
            Effect.all([
              harness.users.insert(
                user('a', { email: 'active-a@example.com' }),
              ),
              harness.users.insert(
                user('b', { email: 'active-b@example.com' }),
              ),
              harness.users.insert(
                user('c', {
                  status: 'inactive',
                  email: 'active-c@example.com',
                }),
              ),
            ]),
          ),
        )
        .verify((result) =>
          Effect.sync(() => assert.equal(result.items.length, 2)),
        )
        .cleanup(harness.cleanup),
  );
