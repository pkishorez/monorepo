import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { table } from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';

export const tellingInfrastructureTheTablesShape = Story.make({
  title: "Telling infrastructure the table's shape",
  description:
    'The table can describe itself as a create-table input, with no client and no credentials, for CDK, Terraform or anything else that makes tables.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'How does infrastructure code learn the shape of the table?',
      {
        answer:
          'From `DynamoDB.getTableDefinition(table)`: a plain create-table input with the key schema, the secondary indexes and on-demand billing. It needs no client, no credentials and no physical name, so infrastructure code can use it straight away; it exists only for DynamoDB because that is the database whose tables infrastructure usually creates.',
        proof: Effect.gen(function* () {
          // Describe the table from chapter 10 as a create-table input.
          const definition = DynamoDB.getTableDefinition(table);
          yield* Story.assert(
            'the primary key maps pk to HASH and sk to RANGE',
            JSON.stringify(definition.KeySchema) ===
              JSON.stringify([
                { AttributeName: 'pk', KeyType: 'HASH' },
                { AttributeName: 'sk', KeyType: 'RANGE' },
              ]),
          );
          yield* Story.assert(
            'both slots are there under their own names',
            definition.LocalSecondaryIndexes?.[0]?.IndexName === 'LSI1' &&
              definition.GlobalSecondaryIndexes?.[0]?.IndexName === 'GSI1',
          );
          yield* Story.assert(
            'billing is on demand',
            definition.BillingMode === 'PAY_PER_REQUEST',
          );
          return definition;
        }),
      },
    ),
    Story.question(
      'The table holds whole tasks. Why are only five attributes declared?',
      {
        answer:
          'Because DynamoDB declares key attributes and nothing else: `pk`, `sk`, and the attributes the two slots use. The bookkeeping columns and your task under `data` travel without a declaration.',
        proof: Effect.gen(function* () {
          // The attribute names the definition declares.
          const declared = DynamoDB.getTableDefinition(table)
            .AttributeDefinitions.map(({ AttributeName }) => AttributeName)
            .sort();
          yield* Story.assert(
            'only the key attributes are declared',
            declared.join() === 'GSI1PK,GSI1SK,LSI1SK,pk,sk',
          );
          yield* Story.assert(
            'the bookkeeping columns and the data are not',
            !declared.some((name) =>
              ['_e', '_u', '_v', '_d', 'data'].includes(name),
            ),
          );
          return { declared };
        }),
      },
    ),
  ],
});
