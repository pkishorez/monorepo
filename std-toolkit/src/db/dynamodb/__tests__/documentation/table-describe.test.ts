import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  makeDocumentationHarness,
  operationDocumentation,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('table-describe');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Table', () => {
    laymosDescribe(
      'Describe',
      {
        description:
          'Describe returns stable operational details for a physical table.',
        documentation: operationDocumentation(
          'Use `describe` for health checks and administration.',
          `const description = yield* table.describe()`,
          'The result intentionally exposes a smaller stable shape than the AWS response.',
        ),
      },
      () => {
        laymosTest(
          'Describes the active table and its declared indexes.',
          {
            description:
              'A physical table has been created from the declared definition. Its description should identify the table, show that it is active, and list its secondary index.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const description = yield* trace(
                harness.provide(harness.table.describe()),
              );

              expect(
                description.tableName.length > 0,
                'The description names the physical table.',
              ).toBe(true);
              expect(
                description.tableStatus,
                'The description says that the table is active.',
              ).toBe('ACTIVE');
              expect(
                description.indexes.map(({ indexName }) => indexName),
                'The description includes the declared secondary index.',
              ).toEqual(['GSI1']);
            }),
        );
      },
    );
  });
});
