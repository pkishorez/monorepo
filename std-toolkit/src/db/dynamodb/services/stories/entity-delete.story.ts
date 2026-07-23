import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { story } from 'laymos/story';

import { dynamodbStoryDocumentation } from './story-documentation.js';

import {
  assertDynamoError,
  makeDynamoStoryHarness,
  user,
} from './dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-delete');
type Input = {
  readonly options?: Parameters<typeof harness.users.delete>[1];
};
const key = { organizationId: 'org-1', userId: 'target' };

story('Delete entity', {
  description:
    'Shows the soft, physical, and missing-item paths of deleting one entity.',
  documentation: dynamodbStoryDocumentation.delete,
})
  .provide(harness.layer)
  .execute((input: Input) => harness.users.delete(key, input.options))
  .scenario(
    'soft delete keeps a readable tombstone',
    {
      description: 'Marks an existing entity deleted without removing its row.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare({}, harness.users.insert(user('target'))),
        )
        .verify((result) =>
          harness.users.get(key).pipe(
            Effect.tap((stored) =>
              Effect.sync(() => {
                assert.equal(result.meta._d, true);
                assert.equal(stored?.meta._d, true);
              }),
            ),
          ),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'hard delete returns a tombstone and removes the row',
    { description: 'Physically deletes after the explicit acknowledgement.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(
            { options: { forceDelete: 'I know what I am doing' } } as const,
            harness.users.insert(user('target')),
          ),
        )
        .verify((result) =>
          harness.users.get(key).pipe(
            Effect.tap((stored) =>
              Effect.sync(() => {
                assert.equal(result.meta._d, true);
                assert.equal(stored, null);
              }),
            ),
          ),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'missing delete returns NoItemToDelete',
    { description: 'Attempts the same delete flow without a stored entity.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare({}))
        .verifyError((error) => assertDynamoError(error, 'NoItemToDelete'))
        .cleanup(harness.cleanup),
  );
