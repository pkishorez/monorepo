import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  makeDocumentationHarness,
  operationDocumentation,
  user,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('entity-query');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

const seed = [
  user('query-a', { email: 'a@example.com' }),
  user('query-b', { email: 'b@example.com' }),
  user('query-c', { email: 'c@example.com', status: 'inactive' }),
];

describe('DynamoDB', () => {
  describe('Entity', () => {
    laymosDescribe(
      'Query',
      {
        description:
          'Query returns decoded entity ranges through primary or named secondary indexes.',
        documentation: operationDocumentation(
          'Use `query` to read an ordered entity partition.',
          `const page = yield* users.query('primary', { pk, sk: { '>=': null } })`,
          'The selected index defines grouping and ordering. A limit bounds one page.',
        ),
      },
      () => {
        laymosTest(
          'Returns every user in the organization in identity order.',
          {
            description:
              'Three users belong to the same organization. Querying that organization should return every user in the order defined by their identities.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(harness.users.batchInsert(seed));

              const page = yield* trace(
                harness.provide(
                  harness.users.query('primary', {
                    pk: { organizationId: 'org-1' },
                    sk: { '>=': null },
                  }),
                ),
              );

              expect(
                page.items.map(({ value }) => value.userId),
                'The users are returned in identity order.',
              ).toEqual(['query-a', 'query-b', 'query-c']);
            }),
        );

        laymosTest(
          'Returns only the requested number of users in one page.',
          {
            description:
              'Three users match the organization, but the caller asks for two. The result should contain only the first two users.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(harness.users.batchInsert(seed));

              const page = yield* trace(
                harness.provide(
                  harness.users.query(
                    'primary',
                    {
                      pk: { organizationId: 'org-1' },
                      sk: { '>=': null },
                    },
                    { limit: 2 },
                  ),
                ),
              );

              expect(
                page.items.map(({ value }) => value.userId),
                'The page contains exactly the first two users.',
              ).toEqual(['query-a', 'query-b']);
            }),
        );

        laymosTest(
          'Returns active users through the status index.',
          {
            description:
              'The table contains active and inactive users. Querying the status view for active users should exclude the inactive user.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(harness.users.batchInsert(seed));

              const page = yield* trace(
                harness.provide(
                  harness.users.query('byStatus', {
                    pk: { status: 'active' },
                    sk: { '>=': null },
                  }),
                ),
              );

              expect(
                page.items.map(({ value }) => value.email),
                'Only active users are returned in email order.',
              ).toEqual(['a@example.com', 'b@example.com']);
            }),
        );
      },
    );
  });
});
