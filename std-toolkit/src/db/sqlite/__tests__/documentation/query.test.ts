import { Effect, Stream } from 'effect';
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
  describe('Entity', () => {
    laymosDescribe(
      'Query',
      {
        description:
          'Queries read an ordered item collection through its primary key or a declared secondary access pattern.',
        documentation: storageDocumentation(
          'Single-table storage groups related records into item collections. A query chooses one declared index, supplies its partition fields, and then narrows or orders the sort-key range. The entity service derives SQL keys and decodes rows back into domain entities.',
          'The primary index answers questions based on the entity’s main ownership relationship, such as “users in this organization.” A secondary index is a deliberately declared alternative question, such as “active users ordered by email.” Range operators describe a cursor boundary. `>=` and `>` move upward in ascending order; `<=` and `<` move downward unless direction is overridden. Limits bound one page, while `queryStream` repeatedly advances the cursor until the item collection is exhausted.',
          `
const page = yield* users.query('primary', {
  pk: { organizationId: 'org-1' },
  sk: { '>=': null },
}, { limit: 20 })

const pages = users.queryStream('byStatus', {
  pk: { status: 'active' },
  sk: { '>': null },
}, { batchSize: 20 })
          `,
          'Queries never scan another partition and secondary keys are entity-scoped, so two entity types sharing the physical index cannot leak into each other’s results. Tombstones remain queryable because synchronization consumers need them. An empty item collection is a successful empty page.',
        ),
      },
      () => {
        laymosTest(
          'Returns one item collection in sort-key order.',
          {
            description:
              'Two organizations share the table. Querying org-1 should return only its users, ordered by their identity-derived primary sort key.',
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
                'The primary query returns only org-1 users in ascending identity order.',
              ).toEqual(['a', 'b', 'c']);
            }),
        );

        laymosTest(
          'Applies an exclusive cursor and page limit.',
          {
            description:
              'The caller has already consumed user a and wants at most one later user. The exclusive boundary should omit a, and the limit should stop before c.',
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
                'The next page begins after a and contains only its requested item.',
              ).toEqual(['b']);
            }),
        );

        laymosTest(
          'Uses a secondary index without mixing other index partitions.',
          {
            description:
              'Active and inactive users share the GSI columns. Querying the active status partition should return only active users, ordered by the declared email sort key.',
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
                'The active status partition is isolated and ordered by email.',
              ).toEqual(['a@example.com', 'z@example.com']);
            }),
        );

        laymosTest(
          'Streams every page without repeating a boundary item.',
          {
            description:
              'Five users exceed the batch size of two. Query stream should issue as many bounded queries as needed, advance from the final item in each page, and yield every user exactly once.',
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
                'The stream yields all users once across deterministic pages.',
              ).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
            }),
        );

        laymosTest(
          'Returns an empty page for an item collection that does not exist.',
          {
            description:
              'No records belong to the requested organization. This is an ordinary query result, not a database error.',
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
                'A missing item collection is represented by an empty page.',
              ).toEqual([]);
            }),
        );
      },
    );
  });
});
