import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  makeDocumentationHarness,
  operationDocumentation,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('table-secondary-index');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Table', () => {
    laymosDescribe(
      'Secondary index',
      {
        description:
          'A table index accessor targets one declared secondary index.',
        documentation: operationDocumentation(
          'Use `table.index` when raw infrastructure needs an alternate physical view.',
          `const active = yield* table.index('GSI1').query({ pk: 'STATUS#active' })`,
          'Domain code should prefer named entity indexes and decoded entities.',
        ),
      },
      () => {
        laymosTest(
          'Returns only active users from the selected secondary index.',
          {
            description:
              'The secondary index contains active and inactive users. Querying the active group should return only active users in index order.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(
                harness.table.batchWrite([
                  {
                    pk: 'USER#1',
                    sk: 'USER#1',
                    GSI1PK: 'STATUS#active',
                    GSI1SK: 'EMAIL#a',
                    email: 'a@example.com',
                  },
                  {
                    pk: 'USER#2',
                    sk: 'USER#2',
                    GSI1PK: 'STATUS#inactive',
                    GSI1SK: 'EMAIL#b',
                    email: 'b@example.com',
                  },
                  {
                    pk: 'USER#3',
                    sk: 'USER#3',
                    GSI1PK: 'STATUS#active',
                    GSI1SK: 'EMAIL#c',
                    email: 'c@example.com',
                  },
                ]),
              );

              const page = yield* trace(
                harness.provide(
                  harness.table
                    .index('GSI1')
                    .query({ pk: 'STATUS#active' }, { ScanIndexForward: true }),
                ),
              );

              expect(
                page.Items.map((item) => item.email),
                'Only users in the active status group are returned.',
              ).toEqual(['a@example.com', 'c@example.com']);
            }),
        );
      },
    );
  });
});
