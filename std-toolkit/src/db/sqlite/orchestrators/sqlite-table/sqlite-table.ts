import type { EntityType } from '../../../../core/index.js';
import type { SingleEntityType } from '../../services/sqlite-single-entity/index.js';
import {
  SQLiteTable as SQLiteTableImplementation,
  type IndexDefinition,
  type SQLiteTableService,
} from '../../services/sqlite-table/index.js';

type PublicTableMember =
  | 'tableName'
  | 'primary'
  | 'secondaryIndexMap'
  | 'snapshot'
  | 'setup'
  | 'dangerouslyRemoveAllItems'
  | 'entity'
  | 'singleEntity'
  | 'transact';

export type SQLiteTable<
  TPrimaryIndex extends IndexDefinition = IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition> = Record<
    string,
    IndexDefinition
  >,
> = Pick<
  SQLiteTableService<TPrimaryIndex, TSecondaryIndexMap>,
  PublicTableMember
>;

interface TableBuilderImplementation<
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
> {
  index<IndexName extends string, Pk extends string, Sk extends string>(
    name: IndexName,
    pk: Pk,
    sk: Sk,
  ): TableBuilderImplementation<
    TPrimaryIndex,
    TSecondaryIndexMap & Record<IndexName, { pk: Pk; sk: Sk }>
  >;
  build(): SQLiteTableService<TPrimaryIndex, TSecondaryIndexMap>;
}

interface SQLiteTableBuilder<
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
> {
  index<IndexName extends string, Pk extends string, Sk extends string>(
    name: IndexName,
    pk: Pk,
    sk: Sk,
  ): SQLiteTableBuilder<
    TPrimaryIndex,
    TSecondaryIndexMap & Record<IndexName, { pk: Pk; sk: Sk }>
  >;
  build(): SQLiteTable<TPrimaryIndex, TSecondaryIndexMap>;
}

const wrapBuilder = <
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
>(
  builder: TableBuilderImplementation<TPrimaryIndex, TSecondaryIndexMap>,
): SQLiteTableBuilder<TPrimaryIndex, TSecondaryIndexMap> => ({
  index: (name, pk, sk) => wrapBuilder(builder.index(name, pk, sk)),
  build: () => builder.build(),
});

export const SQLiteTable = {
  make: (tableName: string) => ({
    primary: <Pk extends string, Sk extends string>(pk: Pk, sk: Sk) =>
      wrapBuilder(SQLiteTableImplementation.make(tableName).primary(pk, sk)),
  }),
} as const;

export type { EntityType, SingleEntityType };
