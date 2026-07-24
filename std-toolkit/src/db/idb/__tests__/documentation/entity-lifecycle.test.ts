import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { beforeAll, describe } from 'vitest';

import {
  expectedEntity,
  makeDocumentationHarness,
  normalizeEntity,
  storageDocumentation,
  user,
} from './documentation-harness.js';

const harness = makeDocumentationHarness();

beforeAll(() => Effect.runPromise(harness.setup));

describe('IndexedDB', () => {
  describe('Entity', () => {
    laymosDescribe(
      'Lifecycle',
      {
        description:
          'An IndexedDB entity moves from creation through guarded changes, tombstones, restoration, and physical removal.',
        documentation: storageDocumentation(
          'The IndexedDB adapter brings the same single-table entity model to a browser-owned object store. Schemas and key derivations stay at the domain level; IndexedDB records, compound keys, indexes, and structured cloning remain behind the adapter.',
          'Every entity has domain `value` and storage `meta`. `_u` is both the synchronization order and the optimistic concurrency token. Read-modify-write operations re-check the token inside one native IndexedDB transaction, so another tab cannot be silently overwritten. Delete writes a tombstone for synchronization. Restore writes a newer live state. Hard delete physically removes one identity and should be used only when no consumer needs a tombstone.',
          `
const created = yield* users.insert(user)
const changed = yield* users.getAndUpdate(key, { name: 'New name' })
const deleted = yield* users.delete(key)
const restored = yield* users.restore(key)
const removed = yield* users.hardDelete(key)
          `,
          'Insert refuses an occupied identity. Missing update, delete, restore, and hard-delete targets are distinct public failures. A callback returning `null` is a successful no-op. The adapter stores `_data` as a native structured-clone object rather than serialized JSON.',
        ),
      },
      () => {
        laymosTest(
          'Creates and retrieves a native IndexedDB entity.',
          {
            description:
              'This is a fresh identity. Insert should save the complete value with live metadata, and a later get should decode the same domain value from the object store.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('idb-create');
              yield* harness.clear;

              const created = yield* trace(
                harness.provide(harness.users.insert(input)),
              );
              const fetched = yield* harness.provide(
                harness.users.get({
                  organizationId: input.organizationId,
                  userId: input.userId,
                }),
              );

              expect(
                normalizeEntity(created),
                'The created IndexedDB entity contains the submitted user and live metadata.',
              ).toEqual(expectedEntity(input));
              expect(
                normalizeEntity(fetched),
                'Reading the object store returns the same public entity.',
              ).toEqual(expectedEntity(input));
            }),
        );

        laymosTest(
          'Returns null when an identity has never been stored.',
          {
            description:
              'Normal lookup absence is not an IndexedDB fault. Get should return `null` so callers can distinguish an empty result from an unavailable database.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const missing = yield* trace(
                harness.provide(
                  harness.users.get({
                    organizationId: 'org-1',
                    userId: 'idb-missing',
                  }),
                ),
              );

              expect(
                missing,
                'An unknown IndexedDB identity is represented by null.',
              ).toBeNull();
            }),
        );

        laymosTest(
          'Rejects an identity that already exists.',
          {
            description:
              'Insert uses an expected-absence condition inside IndexedDB. A second insert for the same compound key must fail rather than replace the first browser record.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(
                harness.users.insert(user('idb-duplicate')),
              );

              const failure = yield* trace(
                harness.provide(
                  harness.users
                    .insert(user('idb-duplicate', { name: 'Replacement user' }))
                    .pipe(Effect.flip),
                ),
              );

              expect(
                failure._tag,
                'A duplicate insert reports the public IndexedDB failure type.',
              ).toBe('StdToolkitError');
              expect(
                failure.code,
                'The failure identifies the violated expected-absence condition.',
              ).toBe('conditionFailed');
            }),
        );

        laymosTest(
          'Changes selected fields and advances the concurrency token.',
          {
            description:
              'The update changes only the user name. Other fields should survive, and `_u` should increase because the returned entity represents a committed change newer than the inserted state.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('idb-update');
              yield* harness.clear;
              const created = yield* harness.provide(
                harness.users.insert(input),
              );

              const changed = yield* trace(
                harness.provide(
                  harness.users.getAndUpdate(
                    {
                      organizationId: input.organizationId,
                      userId: input.userId,
                    },
                    { name: 'Updated user' },
                  ),
                ),
              );

              expect(
                changed.value.email,
                'Fields outside the partial update keep their existing values.',
              ).toBe(input.email);
              expect(
                changed.value.name,
                'The selected field contains the caller’s new value.',
              ).toBe('Updated user');
              expect(
                changed.meta._u > created.meta._u,
                'The update has a newer synchronization and concurrency token.',
              ).toBe(true);
            }),
        );

        laymosTest(
          'Skips a callback update when the callback returns null.',
          {
            description:
              'The callback decides that current state already satisfies the request. No IndexedDB transaction should write a replacement record, so `_u` must stay unchanged.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('idb-no-op');
              yield* harness.clear;
              const created = yield* harness.provide(
                harness.users.insert(input),
              );

              const unchanged = yield* trace(
                harness.provide(
                  harness.users.getAndUpdate(
                    {
                      organizationId: input.organizationId,
                      userId: input.userId,
                    },
                    () => null,
                  ),
                ),
              );

              expect(
                unchanged.meta._u,
                'A deliberate no-op preserves the existing concurrency token.',
              ).toBe(created.meta._u);
              expect(
                normalizeEntity(unchanged),
                'A deliberate no-op returns the unchanged user.',
              ).toEqual(expectedEntity(input));
            }),
        );

        laymosTest(
          'Rejects an update when no entity exists.',
          {
            description:
              'Get-and-update never creates implicitly. A missing identity has its own public code so callers can make an explicit creation decision.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const failure = yield* trace(
                harness.provide(
                  harness.users
                    .getAndUpdate(
                      {
                        organizationId: 'org-1',
                        userId: 'idb-update-missing',
                      },
                      { name: 'Nobody' },
                    )
                    .pipe(Effect.flip),
                ),
              );

              expect(
                failure._tag,
                'A missing update reports the public IndexedDB failure type.',
              ).toBe('StdToolkitError');
              expect(
                failure.code,
                'The failure distinguishes absence from a concurrent condition failure.',
              ).toBe('noItemToUpdate');
            }),
        );

        laymosTest(
          'Deletes and restores an entity as ordered states.',
          {
            description:
              'Soft delete and restore are two visible synchronization events. Both retain the domain value, and each must advance `_u` so every observer can order live, deleted, and restored states.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('idb-restore');
              yield* harness.clear;
              const created = yield* harness.provide(
                harness.users.insert(input),
              );

              const result = yield* trace(
                Effect.gen(function* () {
                  const deleted = yield* harness.provide(
                    harness.users.delete({
                      organizationId: input.organizationId,
                      userId: input.userId,
                    }),
                  );
                  const restored = yield* harness.provide(
                    harness.users.restore({
                      organizationId: input.organizationId,
                      userId: input.userId,
                    }),
                  );
                  return { deleted, restored };
                }),
              );

              expect(
                normalizeEntity(result.deleted),
                'Delete exposes the original user as a tombstone.',
              ).toEqual(expectedEntity(input, true));
              expect(
                result.deleted.meta._u > created.meta._u,
                'The tombstone follows the inserted state.',
              ).toBe(true);
              expect(
                normalizeEntity(result.restored),
                'Restore exposes the original user as live again.',
              ).toEqual(expectedEntity(input));
              expect(
                result.restored.meta._u > result.deleted.meta._u,
                'The restored state follows its tombstone.',
              ).toBe(true);
            }),
        );

        laymosTest(
          'Physically removes one identity when a tombstone is not needed.',
          {
            description:
              'Hard delete is a local cleanup escape hatch. It returns the last public entity but removes its IndexedDB record completely, so a later get sees normal absence.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('idb-hard-delete');
              yield* harness.clear;
              yield* harness.provide(harness.users.insert(input));

              const removed = yield* trace(
                harness.provide(
                  harness.users.hardDelete({
                    organizationId: input.organizationId,
                    userId: input.userId,
                  }),
                ),
              );
              const missing = yield* harness.provide(
                harness.users.get({
                  organizationId: input.organizationId,
                  userId: input.userId,
                }),
              );

              expect(
                normalizeEntity(removed),
                'Hard delete returns the entity that was physically removed.',
              ).toEqual(expectedEntity(input));
              expect(
                missing,
                'The physically removed identity is absent from IndexedDB.',
              ).toBeNull();
            }),
        );
      },
    );
  });
});
