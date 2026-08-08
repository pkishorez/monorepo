import type { TableIdentity } from '../../domain/table-identity/index.js';
import type { IndexDefinition } from '../../types/index.js';
import {
  DynamoTable as DynamoTableImplementation,
  type QueryResult,
  type TableDescription,
} from '../../services/dynamo-table/index.js';
import type { EntityType } from '../../services/dynamo-entity/index.js';
import type { SingleEntityType } from '../../services/dynamo-single-entity/index.js';

type PublicTableMember =
  | 'logicalName'
  | 'primary'
  | 'secondaryIndexMap'
  | 'snapshot'
  | 'entity'
  | 'singleEntity'
  | 'transact'
  | 'createTableDefinition';

export type DynamoTable<
  TPrimaryIndex extends IndexDefinition = IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition> = Record<
    string,
    IndexDefinition
  >,
> = Pick<
  DynamoTableImplementation<TPrimaryIndex, TSecondaryIndexMap>,
  PublicTableMember
> &
  TableIdentity;

interface TableBuilderImplementation<
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
> {
  lsi<IndexName extends string, Sk extends string>(
    name: IndexName,
    sk: Sk,
  ): TableBuilderImplementation<
    TPrimaryIndex,
    TSecondaryIndexMap & Record<IndexName, { pk: TPrimaryIndex['pk']; sk: Sk }>
  >;
  gsi<IndexName extends string, Pk extends string, Sk extends string>(
    name: IndexName,
    pk: Pk,
    sk: Sk,
  ): TableBuilderImplementation<
    TPrimaryIndex,
    TSecondaryIndexMap & Record<IndexName, { pk: Pk; sk: Sk }>
  >;
  build(): DynamoTableImplementation<TPrimaryIndex, TSecondaryIndexMap>;
}

export interface DynamoTableBuilder<
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
> {
  lsi<IndexName extends string, Sk extends string>(
    name: IndexName,
    sk: Sk,
  ): DynamoTableBuilder<
    TPrimaryIndex,
    TSecondaryIndexMap & Record<IndexName, { pk: TPrimaryIndex['pk']; sk: Sk }>
  >;
  gsi<IndexName extends string, Pk extends string, Sk extends string>(
    name: IndexName,
    pk: Pk,
    sk: Sk,
  ): DynamoTableBuilder<
    TPrimaryIndex,
    TSecondaryIndexMap & Record<IndexName, { pk: Pk; sk: Sk }>
  >;
  build(): DynamoTable<TPrimaryIndex, TSecondaryIndexMap>;
}

const wrapBuilder = <
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
>(
  builder: TableBuilderImplementation<TPrimaryIndex, TSecondaryIndexMap>,
): DynamoTableBuilder<TPrimaryIndex, TSecondaryIndexMap> => ({
  lsi: (name, sk) => wrapBuilder(builder.lsi(name, sk)),
  gsi: (name, pk, sk) => wrapBuilder(builder.gsi(name, pk, sk)),
  build: () => builder.build(),
});

export const DynamoTable = {
  make: (logicalName: string) => ({
    primary: <Pk extends string, Sk extends string>(pk: Pk, sk: Sk) =>
      wrapBuilder(DynamoTableImplementation.make(logicalName).primary(pk, sk)),
  }),
} as const;

export type { EntityType, QueryResult, SingleEntityType, TableDescription };
