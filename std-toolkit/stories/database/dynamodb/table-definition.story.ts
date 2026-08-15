import { Effect } from 'effect';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { Story } from 'laymos/story';

import { table } from '../support.js';

export const tableDefinition = Story.make({
  title: 'Table definition for IaC',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How does infrastructure code learn the table topology?', {
      answer:
        'DynamoDB.getTableDefinition projects a StdTable into a pure CreateTableInput — key schema, secondary indexes, billing mode — with no client, credentials, or physical table name involved. CDK or Terraform can consume it directly. Only DynamoDB needs this: IndexedDB and SQLite create their own topology at setup time, but DynamoDB tables are usually provisioned by infrastructure that runs far from application code.',
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
    }),
    Story.question('Why are only five attributes declared?', {
      answer:
        'DynamoDB is schemaless beyond its keys — AttributeDefinitions must name exactly the attributes used by an index and nothing else. The meta columns and data travel undeclared.',
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
