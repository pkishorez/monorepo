import type { Stream } from 'effect';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
} from '../../../eschema/index.js';
import type {
  ChangeNotice,
  DecodedEntity,
  DecodedSingleEntity,
} from '../../../core/index.js';
import {
  Table as DefinitionTable,
  type GlobalSecondaryIndex,
  type GlobalSecondaryIndexMap,
  type LocalSecondaryIndex,
  type LocalSecondaryIndexMap,
  type PrimaryIndex,
  type TableBuilder as DefinitionTableBuilder,
  type TableDefinition as DefinitionTableDefinition,
  type TableTopologyBuilder as DefinitionTopologyBuilder,
} from '../definition/index.js';
import type {
  AnyTransactOp,
  KeyedBuilderStart,
  SingleBuilder,
  TableEffect,
  TransactOp,
} from '../entity/index.js';
import { decorateTable } from './decoration.js';

export interface StdTable<
  Name extends string = string,
  Primary extends PrimaryIndex = PrimaryIndex,
  Lsis extends LocalSecondaryIndexMap = LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap = GlobalSecondaryIndexMap,
> {
  readonly logicalName: Name;
  readonly primary: Primary;
  readonly localSecondaryIndexes: Lsis;
  readonly globalSecondaryIndexes: Gsis;
  snapshot(): ReturnType<DefinitionTableDefinition<Name>['snapshot']>;
  entity<S extends AnyEntityESchema>(
    schema: S,
  ): KeyedBuilderStart<Name, S, Lsis, Gsis>;
  singleEntity<S extends AnyUnkeyedESchema>(schema: S): SingleBuilder<Name, S>;
  transact<const Ops extends readonly AnyTransactOp<Name>[]>(
    ops: Ops,
  ): TableEffect<
    {
      readonly [K in keyof Ops]: Ops[K] extends {
        readonly operationKind: 'checkOp';
      }
        ? null
        : Ops[K] extends TransactOp<Name, infer T>
          ? DecodedEntity<T> | DecodedSingleEntity<T>
          : never;
    },
    Name
  >;
  dangerouslyRemoveAllItems(
    confirmation: 'I KNOW WHAT I AM DOING',
  ): TableEffect<{ readonly itemsDeleted: number }, Name>;
  subscribe(): Stream.Stream<ChangeNotice>;
}

export interface TableBuilder<Name extends string> {
  readonly logicalName: Name;
  primary<Pk extends string, Sk extends string>(
    pk: Pk,
    sk: Sk,
  ): TopologyBuilder<Name, PrimaryIndex<Pk, Sk>, {}, {}>;
}

export interface TopologyBuilder<
  Name extends string,
  Primary extends PrimaryIndex,
  Lsis extends LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap,
> {
  lsi<Slot extends string, Sk extends string>(
    name: Slot,
    sk: Sk,
  ): TopologyBuilder<
    Name,
    Primary,
    Lsis & Record<Slot, LocalSecondaryIndex<Slot, Primary['pk'], Sk>>,
    Gsis
  >;
  gsi<Slot extends string, Pk extends string, Sk extends string>(
    name: Slot,
    pk: Pk,
    sk: Sk,
  ): TopologyBuilder<
    Name,
    Primary,
    Lsis,
    Gsis & Record<Slot, GlobalSecondaryIndex<Slot, Pk, Sk>>
  >;
  build(): StdTable<Name, Primary, Lsis, Gsis>;
}

const wrapTopology = <
  Name extends string,
  Primary extends PrimaryIndex,
  Lsis extends LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap,
>(
  builder: DefinitionTopologyBuilder<Name, Primary, Lsis, Gsis>,
): TopologyBuilder<Name, Primary, Lsis, Gsis> => ({
  lsi<Slot extends string, Sk extends string>(name: Slot, sk: Sk) {
    return wrapTopology(builder.lsi(name, sk));
  },
  gsi<Slot extends string, Pk extends string, Sk extends string>(
    name: Slot,
    pk: Pk,
    sk: Sk,
  ) {
    return wrapTopology(builder.gsi(name, pk, sk));
  },
  build() {
    return decorateTable(builder.build()) as StdTable<
      Name,
      Primary,
      Lsis,
      Gsis
    >;
  },
});

export const StdTable = {
  make<const Name extends string>(name: Name): TableBuilder<Name> {
    const builder = DefinitionTable.make(
      name as never,
    ) as DefinitionTableBuilder<Name>;
    return {
      logicalName: name,
      primary(pk, sk) {
        return wrapTopology(builder.primary(pk, sk));
      },
    };
  },
};
