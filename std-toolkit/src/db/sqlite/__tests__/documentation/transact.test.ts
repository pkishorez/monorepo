import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  makeDocumentationHarness,
  storageDocumentation,
  user,
} from './documentation-harness.js';

const harness = makeDocumentationHarness();

beforeAll(() => Effect.runPromise(harness.setup));
afterAll(() => harness.close());

describe('SQLite', () => {
  describe('Table', () => {
    laymosDescribe(
      'Transact',
      {
        description:
          'A transaction applies prebuilt entity operations atomically and stamps each committed change in operation order.',
        documentation: storageDocumentation(
          'Entity transaction operations describe intended writes without executing them. This separation lets a caller prepare inserts, guarded updates, tombstones, and restorations across entity services, then ask the owning table to commit the complete batch.',
          'Building an operation validates and encodes domain data but does not touch SQLite. At commit time the table begins one native transaction, assigns a monotonic `_u` to each descriptor in operation order, commits, and only then broadcasts the resulting entities. If any expected `_u` or expected absence is false, the table rolls back every write and broadcasts nothing.',
          `
const createUser = yield* users.insertOp(newUser)
const changeOwner = yield* users.getAndUpdateOp(ownerKey, { status: 'active' })

const committed = yield* table.transact([createUser, changeOwner])
          `,
          'Operations belong to the table that created them. Two operations may not target the same logical identity in one batch. Guarded update, delete, and restore operations protect the `_u` observed while they were built; `lastWriteWins` explicitly opts out. Transaction results and their increasing cursors follow operation order.',
        ),
      },
      () => {
        laymosTest(
          'Commits every operation with ordered transaction cursors.',
          {
            description:
              'Two new users are prepared before the transaction. Neither should be visible until commit. Their `_u` values should increase in operation order while SQLite still commits both atomically.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const first = user('sqlite-tx-first');
              const second = user('sqlite-tx-second');
              yield* harness.clear;
              const operations = yield* Effect.all([
                harness.provide(harness.users.insertOp(first)),
                harness.provide(harness.users.insertOp(second)),
              ]);

              const committed = yield* trace(harness.transact(operations));

              expect(
                committed.map(
                  (entity) =>
                    (entity.value as { readonly userId: string }).userId,
                ),
                'The transaction returns both users in operation order.',
              ).toEqual([first.userId, second.userId]);
              expect(
                committed[1]!.meta._u > committed[0]!.meta._u,
                'Transaction cursors preserve the order of the committed operations.',
              ).toBe(true);
            }),
        );

        laymosTest(
          'Rolls back every operation when one identity is already occupied.',
          {
            description:
              'The second operation tries to insert an existing identity. SQLite must undo the otherwise-valid first insert, leaving the table exactly as it was before the transaction.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const existing = user('sqlite-tx-existing');
              const shouldRollback = user('sqlite-tx-rollback');
              yield* harness.clear;
              yield* harness.provide(harness.users.insert(existing));
              const operations = yield* Effect.all([
                harness.provide(harness.users.insertOp(shouldRollback)),
                harness.provide(harness.users.insertOp(existing)),
              ]);

              const failure = yield* trace(
                harness.transact(operations).pipe(Effect.flip),
              );
              const rolledBack = yield* harness.provide(
                harness.users.get({
                  organizationId: shouldRollback.organizationId,
                  userId: shouldRollback.userId,
                }),
              );

              expect(
                failure._tag,
                'A rejected transaction reports the public SQLite failure wrapper.',
              ).toBe('SqliteDBError');
              expect(
                failure.error._tag,
                'The transaction reports the failed expected-absence condition.',
              ).toBe('ConditionFailed');
              expect(
                rolledBack,
                'The valid first insert is absent because the whole transaction rolled back.',
              ).toBeNull();
            }),
        );
      },
    );
  });
});
