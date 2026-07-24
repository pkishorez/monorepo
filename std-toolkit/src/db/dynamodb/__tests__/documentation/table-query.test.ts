import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  makeDocumentationHarness,
  operationDocumentation,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('table-query');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

const items = [
  { pk: 'TABLE#query', sk: 'ITEM#a', value: 'a' },
  { pk: 'TABLE#query', sk: 'ITEM#b', value: 'b' },
  { pk: 'TABLE#query', sk: 'ITEM#c', value: 'c' },
  { pk: 'TABLE#other', sk: 'ITEM#z', value: 'z' },
];

describe('DynamoDB', () => {
  describe('Table', () => {
    laymosDescribe(
      'Query',
      {
        description:
          'Table query reads raw ordered items from one physical partition.',
        documentation: operationDocumentation(
          'Use table query when infrastructure intentionally works with physical keys.',
          `const page = yield* table.query({ pk: 'ACCOUNT#1', sk: { '>=': 'ORDER#' } })`,
          'A limit bounds one page and a continuation key identifies remaining results.',
        ),
      },
      () => {
        laymosTest(
          'Returns the requested part of an ordered table partition.',
          {
            description:
              'The partition contains three ordered items, and the caller starts from the second one. Only the second and third items should be returned.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(harness.table.batchWrite(items));

              const page = yield* trace(
                harness.provide(
                  harness.table.query(
                    { pk: 'TABLE#query', sk: { '>=': 'ITEM#b' } },
                    { ScanIndexForward: true },
                  ),
                ),
              );

              expect(
                page.Items.map((item) => item.value),
                'Only values at or after the requested starting point are returned.',
              ).toEqual(['b', 'c']);
            }),
        );

        laymosTest(
          'Returns a limited page and indicates that more items remain.',
          {
            description:
              'Three items match, but the caller asks for a page of two. The page should contain two items and tell the caller that another item remains.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(harness.table.batchWrite(items));

              const page = yield* trace(
                harness.provide(
                  harness.table.query(
                    { pk: 'TABLE#query' },
                    { Limit: 2, ScanIndexForward: true },
                  ),
                ),
              );

              expect(
                page.Items.map((item) => item.value),
                'The page contains exactly the first two matching items.',
              ).toEqual(['a', 'b']);
              expect(
                page.LastEvaluatedKey !== undefined,
                'The page indicates that another matching item can be read.',
              ).toBe(true);
            }),
        );
      },
    );
  });
});
