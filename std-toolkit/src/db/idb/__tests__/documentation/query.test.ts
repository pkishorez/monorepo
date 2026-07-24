import { Effect, Stream } from 'effect';
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
  describe('Entity', () => {
    laymosDescribe(
      'Query',
      {
        description:
          'IndexedDB queries expose ordered item collections and sparse secondary indexes through the same domain access patterns as server storage.',
        documentation: storageDocumentation(
          'An IndexedDB item collection is every record sharing a derived partition key. Querying the primary index reads the main ownership relationship; querying a declared secondary index reads an alternative relationship using a native IndexedDB index.',
          'Compound `[pk, sk]` keys preserve ordering inside each partition. Range operators become native key ranges, so boundaries remain strict or inclusive as written. Secondary indexes are sparse: a record lacking the declared index fields simply does not appear. `queryStream` turns bounded pages into a complete stream by advancing from the final sort key in each page.',
          `
const page = yield* users.query('primary', {
  pk: { organizationId: 'org-1' },
  sk: { '>=': null },
})

const pages = users.queryStream('primary', {
  pk: { organizationId: 'org-1' },
  sk: { '>': null },
}, { batchSize: 20 })
          `,
          'A query cannot cross into another partition. Entity-specific prefixes prevent shared native indexes from mixing types. Tombstones remain present for synchronization. Missing partitions return empty pages, and limits apply after the range boundary.',
        ),
      },
      () => {
        laymosTest(
          'Returns one browser item collection in sort-key order.',
          {
            description:
              'Records for two organizations share the object store. The org-1 query should remain inside its compound-key partition and order users by identity.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* Effect.forEach(
                [
                  user('a', { organizationId: 'org-1' }),
                  user('c', { organizationId: 'org-1' }),
                  user('b', { organizationId: 'org-1' }),
                  user('outside', { organizationId: 'org-2' }),
                ],
                (input) => harness.provide(harness.users.insert(input)),
                { discard: true },
              );

              const result = yield* trace(
                harness.provide(
                  harness.users.query('primary', {
                    pk: { organizationId: 'org-1' },
                    sk: { '>=': null },
                  }),
                ),
              );

              expect(
                result.items.map((entity) => entity.value.userId),
                'The IndexedDB range contains only org-1 users in ascending identity order.',
              ).toEqual(['a', 'b', 'c']);
            }),
        );

        laymosTest(
          'Applies an exclusive browser cursor and page limit.',
          {
            description:
              'User a is the previous page boundary. A strict greater-than range must start at b, and the requested limit must return only that one record.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* Effect.forEach(
                ['a', 'b', 'c'],
                (userId) => harness.provide(harness.users.insert(user(userId))),
                { discard: true },
              );

              const result = yield* trace(
                harness.provide(
                  harness.users.query(
                    'primary',
                    {
                      pk: { organizationId: 'org-1' },
                      sk: { '>': 'a' },
                    },
                    { limit: 1 },
                  ),
                ),
              );

              expect(
                result.items.map((entity) => entity.value.userId),
                'The browser page begins after a and respects its one-item limit.',
              ).toEqual(['b']);
            }),
        );

        laymosTest(
          'Queries one sparse secondary-index partition.',
          {
            description:
              'Active and inactive users have different secondary partition keys. IndexedDB should use the active range only and order it by the derived email sort key.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* Effect.forEach(
                [
                  user('z-active', { email: 'z@example.com' }),
                  user('a-active', { email: 'a@example.com' }),
                  user('inactive', {
                    email: 'm@example.com',
                    status: 'inactive',
                  }),
                ],
                (input) => harness.provide(harness.users.insert(input)),
                { discard: true },
              );

              const result = yield* trace(
                harness.provide(
                  harness.users.query('byStatus', {
                    pk: { status: 'active' },
                    sk: { '>=': null },
                  }),
                ),
              );

              expect(
                result.items.map((entity) => entity.value.email),
                'The active IndexedDB index partition is isolated and ordered by email.',
              ).toEqual(['a@example.com', 'z@example.com']);
            }),
        );

        laymosTest(
          'Streams every IndexedDB page without duplicate boundaries.',
          {
            description:
              'Five records require three native range reads at batch size two. Advancing with a strict cursor should yield each identity once.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* Effect.forEach(
                ['a', 'b', 'c', 'd', 'e'],
                (userId) => harness.provide(harness.users.insert(user(userId))),
                { discard: true },
              );

              const pages = yield* trace(
                harness.provide(
                  Stream.runCollect(
                    harness.users.queryStream(
                      'primary',
                      {
                        pk: { organizationId: 'org-1' },
                        sk: { '>': null },
                      },
                      { batchSize: 2 },
                    ),
                  ),
                ),
              );

              expect(
                pages.map((page) => page.map((entity) => entity.value.userId)),
                'The IndexedDB stream yields every user once across three pages.',
              ).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
            }),
        );

        laymosTest(
          'Returns an empty page for an unknown browser partition.',
          {
            description:
              'The requested organization has no compound-key range. IndexedDB absence should remain an empty successful result.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const result = yield* trace(
                harness.provide(
                  harness.users.query('primary', {
                    pk: { organizationId: 'unknown-org' },
                    sk: { '>=': null },
                  }),
                ),
              );

              expect(
                result.items,
                'An unknown IndexedDB item collection is an empty page.',
              ).toEqual([]);
            }),
        );
      },
    );
  });
});
