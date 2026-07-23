import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { markdown, story } from 'laymos/story';

import { makeDynamoStoryHarness, user } from './dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-read');

type Input = { readonly userId: string; readonly consistent: boolean };

story('Get entity', {
  description:
    'Shows the observable results of reading present and absent keyed entities.',
  documentation: markdown`
    ## Reading by complete identity

    Entity reads require the complete primary key. The service encodes that
    key, performs the DynamoDB read, and decodes the stored item into the
    current schema version. Absence is represented as \`null\`; it is not an
    exceptional result.

    ~~~ts
    const user =
      yield *
      users.get(
        { organizationId: 'org-1', userId: 'user-1' },
        { ConsistentRead: true },
      );
    ~~~

    Use a strongly consistent read only when the caller must observe the
    latest completed write.
  `,
})
  .provide(harness.layer)
  .execute((input: Input) =>
    harness.users.get(
      { organizationId: 'org-1', userId: input.userId },
      { ConsistentRead: input.consistent },
    ),
  )
  .scenario(
    'get returns the decoded stored entity',
    {
      description: 'Reads a seeded user using a strongly consistent request.',
      documentation: markdown`
        A seeded item is fetched with \`ConsistentRead: true\`. The scenario
        verifies the decoded domain value rather than the raw DynamoDB shape.
      `,
    },
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
    {
      description: 'Reads an identity that has never been stored.',
      documentation: markdown`
        Missing keys complete successfully with \`null\`. Callers can branch on
        presence without translating a storage exception.
      `,
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare({ userId: 'missing', consistent: false }),
        )
        .verify((result) => Effect.sync(() => assert.equal(result, null)))
        .cleanup(harness.cleanup),
  );
