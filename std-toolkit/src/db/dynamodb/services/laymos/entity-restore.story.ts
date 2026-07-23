import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { story } from 'laymos/story';

import { dynamodbStoryDocumentation } from './story-documentation.js';

import {
  assertDynamoError,
  makeDynamoStoryHarness,
  user,
} from './dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('entity-restore');
const key = { organizationId: 'org-1', userId: 'target' };
type Input = { readonly beforeCursor?: string };

story('Restore entity', {
  description:
    'Shows the tombstone, already-live, and missing-item paths of restoring one entity.',
  documentation: dynamodbStoryDocumentation.restore,
})
  .provide(harness.layer)
  .execute((_input: Input) => harness.users.restore(key))
  .scenario(
    'restore makes a tombstone live with a newer cursor',
    { description: 'Restores a prepared tombstone and stamps a fresh cursor.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(undefined).pipe(
            Effect.andThen(harness.users.insert(user('target'))),
            Effect.andThen(harness.users.delete(key)),
            Effect.map((deleted) => ({ beforeCursor: deleted.meta._u })),
          ),
        )
        .verify((result, prepared) =>
          Effect.sync(() => {
            assert.equal(result.meta._d, false);
            assert.ok(result.meta._u > prepared.beforeCursor!);
          }),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'restoring a live entity is an unchanged no-op',
    { description: 'Runs restore against an entity that is already live.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(undefined).pipe(
            Effect.andThen(harness.users.insert(user('target'))),
            Effect.map((before) => ({ beforeCursor: before.meta._u })),
          ),
        )
        .verify((result, prepared) =>
          Effect.sync(() =>
            assert.equal(result.meta._u, prepared.beforeCursor),
          ),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'missing restore returns NoItemToRestore',
    { description: 'Runs restore without a stored entity.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare({}))
        .verifyError((error) => assertDynamoError(error, 'NoItemToRestore'))
        .cleanup(harness.cleanup),
  );
