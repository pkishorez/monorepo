import type { TableDefinition } from '../../std-table/definition/index.js';
import type { CreateTableInput } from '../client/index.js';

type DynamoTable = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

export interface DynamoTableTopology {
  readonly AttributeDefinitions: NonNullable<
    CreateTableInput['AttributeDefinitions']
  >;
  readonly KeySchema: NonNullable<CreateTableInput['KeySchema']>;
  readonly LocalSecondaryIndexes?: NonNullable<
    CreateTableInput['LocalSecondaryIndexes']
  >;
  readonly GlobalSecondaryIndexes?: NonNullable<
    CreateTableInput['GlobalSecondaryIndexes']
  >;
  readonly BillingMode: 'PAY_PER_REQUEST';
}

export const getTableDefinition = (table: DynamoTable): DynamoTableTopology => {
  const localIndexes = Object.values(table.localSecondaryIndexes);
  const globalIndexes = Object.values(table.globalSecondaryIndexes);
  const attributes = new Set([
    table.primary.pk,
    table.primary.sk,
    ...localIndexes.map(({ sk }) => sk),
    ...globalIndexes.flatMap(({ pk, sk }) => [pk, sk]),
  ]);
  return {
    AttributeDefinitions: [...attributes].map((AttributeName) => ({
      AttributeName,
      AttributeType: 'S',
    })),
    KeySchema: [
      { AttributeName: table.primary.pk, KeyType: 'HASH' },
      { AttributeName: table.primary.sk, KeyType: 'RANGE' },
    ],
    ...(localIndexes.length === 0
      ? {}
      : {
          LocalSecondaryIndexes: localIndexes.map((index) => ({
            IndexName: index.name,
            KeySchema: [
              { AttributeName: index.pk, KeyType: 'HASH' },
              { AttributeName: index.sk, KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          })),
        }),
    ...(globalIndexes.length === 0
      ? {}
      : {
          GlobalSecondaryIndexes: globalIndexes.map((index) => ({
            IndexName: index.name,
            KeySchema: [
              { AttributeName: index.pk, KeyType: 'HASH' },
              { AttributeName: index.sk, KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          })),
        }),
    BillingMode: 'PAY_PER_REQUEST',
  };
};
