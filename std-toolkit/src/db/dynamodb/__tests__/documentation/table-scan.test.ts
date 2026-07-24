import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  makeDocumentationHarness,
  operationDocumentation,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('table-scan');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Table', () => {
    laymosDescribe(
      'Scan',
      {
        description: 'Scan reads a bounded raw page without a partition key.',
        documentation: operationDocumentation(
          'Use `scan` only for workflows that cannot use a partition query.',
          `const page = yield* table.scan({ Limit: 100 })`,
          'Scans should remain bounded and continue with the returned key.',
        ),
      },
      () => {
        laymosTest(
          'Returns a limited scan page and indicates that more items remain.',
          {
            description:
              'The table contains three items, but the caller asks for two. The scan should return two items and indicate that another page is available.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(
                harness.table.batchWrite([
                  { pk: 'SCAN#a', sk: 'ITEM', value: 'a' },
                  { pk: 'SCAN#b', sk: 'ITEM', value: 'b' },
                  { pk: 'SCAN#c', sk: 'ITEM', value: 'c' },
                ]),
              );

              const page = yield* trace(
                harness.provide(harness.table.scan({ Limit: 2 })),
              );

              expect(
                page.Items.length,
                'The scan returns exactly the requested two items.',
              ).toBe(2);
              expect(
                page.LastEvaluatedKey !== undefined,
                'The scan indicates that another item can still be read.',
              ).toBe(true);
            }),
        );
      },
    );
  });
});
