import type { Layer } from 'effect';
import type { TableDefinition } from '../std-table/definition/index.js';
import {
  contractLayer,
  type EncodedItem,
  type StdTableService,
} from '../std-table/contract/index.js';
import { makeTableContract } from './table/index.js';

type TableSource<Name extends string> = Pick<
  TableDefinition<Name>,
  'logicalName' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

export interface MemoryTable<Name extends string> {
  readonly layer: Layer.Layer<StdTableService<Name>>;
}

const make = <Name extends string>(
  table: TableSource<Name>,
): MemoryTable<Name> => {
  const items = new Map<string, EncodedItem>();
  return {
    layer: contractLayer(table.logicalName, makeTableContract(table, items)),
  };
};

export const Memory = { make } as const;
