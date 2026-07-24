import { laymosDescribe, laymosTest } from 'laymos/test';
import { describe } from 'vitest';

import {
  makeDocumentationHarness,
  operationDocumentation,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('table-definition');

describe('DynamoDB', () => {
  describe('Table', () => {
    laymosDescribe(
      'Definition',
      {
        description:
          'A table definition produces the physical primary and secondary key schema.',
        documentation: operationDocumentation(
          'Define table topology once before attaching entities.',
          `const table = DynamoTable.make().primary('pk', 'sk').gsi('GSI1', 'GSI1PK', 'GSI1SK').build()`,
          '`getTableSchema` returns the key and attribute definitions used during provisioning.',
        ),
      },
      () => {
        laymosTest(
          'Produces the primary and secondary keys declared by the table builder.',
          {
            description:
              'The table builder declares one primary key and one secondary index. The provisioning schema should contain those exact key definitions.',
          },
          ({ expect }) => {
            const schema = harness.table.getTableSchema();

            expect(
              {
                primary: (schema.KeySchema ?? []).map((key) => ({
                  attribute: key.AttributeName,
                  type: key.KeyType,
                })),
                secondary: (schema.GlobalSecondaryIndexes ?? []).map(
                  (index) => ({
                    name: index.IndexName,
                    keys: index.KeySchema.map((key) => ({
                      attribute: key.AttributeName,
                      type: key.KeyType,
                    })),
                  }),
                ),
              },
              'The provisioning schema contains every declared table key.',
            ).toEqual({
              primary: [
                { attribute: 'pk', type: 'HASH' },
                { attribute: 'sk', type: 'RANGE' },
              ],
              secondary: [
                {
                  name: 'GSI1',
                  keys: [
                    { attribute: 'GSI1PK', type: 'HASH' },
                    { attribute: 'GSI1SK', type: 'RANGE' },
                  ],
                },
              ],
            });
          },
        );
      },
    );
  });
});
