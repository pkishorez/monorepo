import type { EntityType, SingleEntityType } from '../../../../core/index.js';
import {
  IdbTable as IdbTableImplementation,
  type IdbTableService,
  type IndexDefinition,
} from '../../services/idb-table/index.js';

type PublicTableMember =
  | 'storeName'
  | 'primary'
  | 'secondaryIndexMap'
  | 'snapshot'
  | 'setup'
  | 'dangerouslyRemoveAllItems'
  | 'entity'
  | 'singleEntity'
  | 'transact';

export type IdbTable<
  TPrimaryIndex extends IndexDefinition = IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition> = Record<
    string,
    IndexDefinition
  >,
> = Pick<IdbTableService<TPrimaryIndex, TSecondaryIndexMap>, PublicTableMember>;

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
  build(): IdbTableService<TPrimaryIndex, TSecondaryIndexMap>;
}

const wrapBuilder = <
  TPrimaryIndex extends IndexDefinition,
  TSecondaryIndexMap extends Record<string, IndexDefinition>,
>(
  builder: TableBuilderImplementation<TPrimaryIndex, TSecondaryIndexMap>,
) => ({
  index: <IndexName extends string, Pk extends string, Sk extends string>(
    name: IndexName,
    pk: Pk,
    sk: Sk,
  ) => wrapBuilder(builder.index(name, pk, sk)),
  build: () => builder.build() as IdbTable<TPrimaryIndex, TSecondaryIndexMap>,
});

export const IdbTable = {
  make: (storeName: string) => ({
    primary: <Pk extends string, Sk extends string>(pk: Pk, sk: Sk) =>
      wrapBuilder(IdbTableImplementation.make(storeName).primary(pk, sk)),
  }),
} as const;

export type { EntityType, SingleEntityType };
