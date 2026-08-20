import { Effect } from 'effect';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { Story } from 'laymos/story';

import { table } from '../support.js';

export const tableDefinition = Story.make({
  title: 'Table definition for IaC',
  description:
    'Turn a table into an input that infrastructure code can use to create it.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'How does infrastructure code learn the shape of the table?',
      {
        answer:
          'Ask the adapter for the table definition. It turns the table into a plain create-table input: the key schema, the secondary indexes, and the billing mode. It needs no client, no credentials, and no physical table name. CDK or Terraform can use it directly. Only DynamoDB needs this, because infrastructure code usually creates its tables.',
        proof: Effect.gen(function* () {
          const definition = DynamoDB.getTableDefinition(table);
          yield* Story.assert(
            'the primary index maps pk to HASH and sk to RANGE',
            JSON.stringify(definition.KeySchema) ===
              JSON.stringify([
                { AttributeName: 'pk', KeyType: 'HASH' },
                { AttributeName: 'sk', KeyType: 'RANGE' },
              ]),
          );
          yield* Story.assert(
            'the declared LSI and GSI slots survive the projection',
            definition.LocalSecondaryIndexes?.[0]?.IndexName === 'LSI1' &&
              definition.GlobalSecondaryIndexes?.[0]?.IndexName === 'GSI1',
          );
          yield* Story.assert(
            'billing is on-demand',
            definition.BillingMode === 'PAY_PER_REQUEST',
          );
          return definition;
        }),
      },
    ),
    Story.question('Why are only five attributes declared?', {
      answer:
        'DynamoDB declares its key attributes and nothing else. The definition must name the attributes that an index uses, and no others. The metadata columns and the value travel without a declaration.',
      proof: Effect.gen(function* () {
        const definition = DynamoDB.getTableDefinition(table);
        const declared = definition.AttributeDefinitions.map(
          ({ AttributeName }) => AttributeName,
        ).sort();
        yield* Story.assert(
          'only key attributes are declared',
          JSON.stringify(declared) ===
            JSON.stringify(['GSI1PK', 'GSI1SK', 'LSI1SK', 'pk', 'sk']),
        );
        yield* Story.assert(
          'meta columns and data are not part of the physical schema',
          !declared.some((name) => ['_e', '_u', 'data'].includes(name)),
        );
        return declared;
      }),
    }),
  ],
});
