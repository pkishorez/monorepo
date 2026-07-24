import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { beforeAll, describe } from 'vitest';

import {
  makeDocumentationHarness,
  storageDocumentation,
  user,
} from './documentation-harness.js';

const harness = makeDocumentationHarness();

beforeAll(() => Effect.runPromise(harness.setup));

describe('IndexedDB', () => {
  describe('Table', () => {
    laymosDescribe(
      'Transact',
      {
        description:
          'A buffered IndexedDB transaction validates plain write descriptors and applies them atomically in one native transaction.',
        documentation: storageDocumentation(
          'IndexedDB transactions cannot remain open across arbitrary Effect work. The adapter therefore uses buffered transaction operations: entity services prepare plain descriptors first, and the table later applies all of them inside one short native transaction.',
          'Preparation can validate schemas and read the current `_u`, but it does not write. Commit assigns monotonic cursors in operation order, checks every expected absence or expected `_u` inside IndexedDB, applies the descriptors, and waits for the native transaction to complete. Only a successful commit returns and broadcasts entities. A single conflict aborts the native transaction, so partial browser state cannot escape.',
          `
const createUser = yield* users.insertOp(newUser)
const deleteOld = yield* users.deleteOp(oldUserKey)

const committed = yield* table.transact([createUser, deleteOld])
          `,
          'Every operation must come from this table. Operations targeting the same compound key are rejected as ambiguous. Updates remain optimistic across tabs because their expected `_u` is checked during commit. `lastWriteWins` is an explicit choice to remove that guard.',
        ),
      },
      () => {
        laymosTest(
          'Commits every buffered operation with ordered cursors.',
          {
            description:
              'Two inserts are prepared as inert descriptors. Applying them should create both records atomically while their `_u` values preserve operation order.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const first = user('idb-tx-first');
              const second = user('idb-tx-second');
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
                'The IndexedDB transaction returns both users in operation order.',
              ).toEqual([first.userId, second.userId]);
              expect(
                committed[1]!.meta._u > committed[0]!.meta._u,
                'Browser transaction cursors preserve buffered operation order.',
              ).toBe(true);
            }),
        );

        laymosTest(
          'Aborts every buffered operation when one condition fails.',
          {
            description:
              'The second insert targets an existing compound key. Native IndexedDB atomicity should abort the first valid insert as well, leaving no partially committed batch.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const existing = user('idb-tx-existing');
              const shouldRollback = user('idb-tx-rollback');
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
                'A rejected browser transaction reports the public storage failure type.',
              ).toBe('StdToolkitError');
              expect(
                failure.code,
                'The browser transaction identifies its failed optimistic condition.',
              ).toBe('conditionFailed');
              expect(
                rolledBack,
                'The otherwise-valid first insert is absent after the native transaction aborts.',
              ).toBeNull();
            }),
        );
      },
    );
  });
});
