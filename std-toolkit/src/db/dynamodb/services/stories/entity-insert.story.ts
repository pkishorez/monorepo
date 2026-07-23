import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { markdown, story } from 'laymos/story';

import {
  assertDynamoError,
  assertNonEmptyCursor,
  makeDynamoStoryHarness,
  user,
} from './dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-insert');
type Input = Parameters<typeof harness.users.insert>[0];

story('Insert entity', {
  description:
    'Shows every feasible outcome of inserting one keyed DynamoDB entity.',
  documentation: markdown`
      ## Creating an entity once

      Insert encodes a domain value and writes it under a condition that the
      primary key does not already exist. This makes creation atomic even when
      multiple writers race.

      \`\`\`ts
      const created = yield* users.insert({
        organizationId: 'org-1',
        userId: 'user-1',
        name: 'Ada',
      });
      \`\`\`

      A duplicate identity fails with \`ItemAlreadyExists\` instead of silently
      replacing the stored entity.
    `,
})
  .provide(harness.layer)
  .execute((input: Input) => harness.users.insert(input))
  .scenario(
    'insert returns the stored user with fresh metadata',
    {
      description: 'Inserts a new identity into an empty table.',
      documentation: markdown`
        The successful path verifies both the decoded value and fresh storage
        metadata, including the entity discriminator and update cursor.
      `,
    },
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
      documentation: markdown`
        The table already contains the requested identity. The conditional
        write must fail as \`ItemAlreadyExists\` and preserve the original item.
      `,
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
