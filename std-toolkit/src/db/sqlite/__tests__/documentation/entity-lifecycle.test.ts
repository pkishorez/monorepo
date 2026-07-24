import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  expectedEntity,
  makeDocumentationHarness,
  normalizeEntity,
  storageDocumentation,
  user,
} from './documentation-harness.js';

const harness = makeDocumentationHarness();

beforeAll(() => Effect.runPromise(harness.setup));
afterAll(() => harness.close());

describe('SQLite', () => {
  describe('Entity', () => {
    laymosDescribe(
      'Lifecycle',
      {
        description:
          'A SQLite entity moves from creation through reads, guarded changes, tombstones, restoration, and optional physical removal.',
        documentation: storageDocumentation(
          'An entity is a domain value stored in a shared SQLite table. Its schema supplies the entity name and identity field; the table definition derives the partition and sort keys. Callers work with domain fields rather than SQL rows.',
          'Every returned entity has `value` and `meta`. `_e` identifies the entity type, `_v` identifies the schema version, `_u` is a new monotonic change marker for each committed change, and `_d` says whether the record is a live value or a tombstone. Normal deletion is therefore another versioned state, not disappearance. That lets synchronization consumers observe the deletion. Restoration writes a newer live state. Hard deletion is reserved for cleanup where propagation is not needed.',
          `
const created = yield* users.insert(user)
const current = yield* users.get({ organizationId, userId })
const changed = yield* users.getAndUpdate(
  { organizationId, userId },
  current => ({ name: current.name.toUpperCase() }),
)
const deleted = yield* users.delete({ organizationId, userId })
const restored = yield* users.restore({ organizationId, userId })
          `,
          'Insert refuses an existing identity. Updates, deletes, and restores refuse missing identities. A callback may return `null` to make a deliberate no-op. SQLite keeps tombstones readable and queryable; callers decide whether their view includes deleted records. Every successful state change advances `_u`.',
        ),
      },
      () => {
        laymosTest(
          'Creates a new entity with storage metadata.',
          {
            description:
              'The table is empty and this user identity has never existed. Inserting should persist the complete domain value as a live v1 entity with a generated change marker.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('sqlite-create');
              yield* harness.clear;

              const created = yield* trace(
                harness.provide(harness.users.insert(input)),
              );

              expect(
                normalizeEntity(created),
                'The created SQLite entity contains the submitted user and live metadata.',
              ).toEqual(expectedEntity(input));
            }),
        );

        laymosTest(
          'Rejects an identity that already exists.',
          {
            description:
              'A user already occupies this primary identity. Insert is creation-only, so a second value must fail rather than silently replacing the existing record.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(
                harness.users.insert(user('sqlite-duplicate')),
              );

              const failure = yield* trace(
                harness.provide(
                  harness.users
                    .insert(
                      user('sqlite-duplicate', { name: 'Replacement user' }),
                    )
                    .pipe(Effect.flip),
                ),
              );

              expect(
                failure._tag,
                'A duplicate insert reports the public SQLite failure wrapper.',
              ).toBe('SqliteDBError');
              expect(
                failure.error._tag,
                'The failure explains that the identity is already occupied.',
              ).toBe('ItemAlreadyExists');
            }),
        );

        laymosTest(
          'Returns a saved entity and returns null for an unknown identity.',
          {
            description:
              'Get is a lookup, not an assertion that data exists. A known key should decode the domain value; a genuinely absent key should produce `null` instead of turning normal absence into an error.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('sqlite-get');
              yield* harness.clear;
              yield* harness.provide(harness.users.insert(input));

              const result = yield* trace(
                Effect.all({
                  saved: harness.provide(
                    harness.users.get({
                      organizationId: input.organizationId,
                      userId: input.userId,
                    }),
                  ),
                  missing: harness.provide(
                    harness.users.get({
                      organizationId: 'org-1',
                      userId: 'sqlite-missing',
                    }),
                  ),
                }),
              );

              expect(
                normalizeEntity(result.saved),
                'The known identity resolves to the saved user.',
              ).toEqual(expectedEntity(input));
              expect(
                result.missing,
                'An unknown identity is represented by null.',
              ).toBeNull();
            }),
        );

        laymosTest(
          'Changes selected fields while preserving the rest of the entity.',
          {
            description:
              'A caller changes only the name. Get-and-update reads the current value, merges the partial change, guards the write with the `_u` it read, and returns a newer entity.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('sqlite-update');
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
                'The committed update has a newer change marker.',
              ).toBe(true);
            }),
        );

        laymosTest(
          'Skips a callback update when the callback returns null.',
          {
            description:
              'A read-modify-write callback can inspect current state and decide that no change is needed. Returning `null` should preserve both the value and its change marker because no write occurred.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('sqlite-no-op');
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
                'A deliberate no-op keeps the existing change marker.',
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
              'Get-and-update is a change to existing state, not an upsert. A missing identity should fail with the public no-item variant so callers can choose whether to create separately.',
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
                        userId: 'sqlite-update-missing',
                      },
                      { name: 'Nobody' },
                    )
                    .pipe(Effect.flip),
                ),
              );

              expect(
                failure._tag,
                'A missing update reports the public SQLite failure wrapper.',
              ).toBe('SqliteDBError');
              expect(
                failure.error._tag,
                'The failure distinguishes absence from a conflicting write.',
              ).toBe('NoItemToUpdate');
            }),
        );

        laymosTest(
          'Deletes an entity by writing a newer tombstone.',
          {
            description:
              'Soft deletion keeps the value and identity but marks the record deleted. The new change marker lets downstream synchronization order the tombstone after the live value.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('sqlite-delete');
              yield* harness.clear;
              const created = yield* harness.provide(
                harness.users.insert(input),
              );

              const deleted = yield* trace(
                harness.provide(
                  harness.users.delete({
                    organizationId: input.organizationId,
                    userId: input.userId,
                  }),
                ),
              );

              expect(
                normalizeEntity(deleted),
                'Deletion returns the original user as a tombstone.',
              ).toEqual(expectedEntity(input, true));
              expect(
                deleted.meta._u > created.meta._u,
                'The tombstone is ordered after the live entity.',
              ).toBe(true);
            }),
        );

        laymosTest(
          'Restores a tombstone as a newer live entity.',
          {
            description:
              'The entity currently exists as a tombstone. Restore should retain its domain fields, clear the deleted flag, and create another change marker rather than erasing history.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const input = user('sqlite-restore');
              yield* harness.clear;
              yield* harness.provide(harness.users.insert(input));
              const deleted = yield* harness.provide(
                harness.users.delete({
                  organizationId: input.organizationId,
                  userId: input.userId,
                }),
              );

              const restored = yield* trace(
                harness.provide(
                  harness.users.restore({
                    organizationId: input.organizationId,
                    userId: input.userId,
                  }),
                ),
              );

              expect(
                normalizeEntity(restored),
                'Restoration returns the original user as live state.',
              ).toEqual(expectedEntity(input));
              expect(
                restored.meta._u > deleted.meta._u,
                'The restored state is ordered after its tombstone.',
              ).toBe(true);
            }),
        );
      },
    );
  });
});
