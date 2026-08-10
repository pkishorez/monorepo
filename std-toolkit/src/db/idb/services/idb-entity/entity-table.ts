import type { Effect } from 'effect';
import type { IdbDBError } from '../../domain/idb-error/index.js';
import type { IdbDB, IdbRecord } from '../idb-database/index.js';

export type SortKeyCondition =
  | { '<': string }
  | { '<=': string }
  | { '>': string }
  | { '>=': string }
  | { '=': string }
  | { between: [string, string] }
  | { beginsWith: string };

export interface IdbEntityTable {
  readonly storeName: string;
  readonly primary: { readonly pk: string; readonly sk: string };
  readonly secondaryIndexMap: Record<
    string,
    { readonly pk: string; readonly sk: string }
  >;
  getItem(key: {
    readonly pk: string;
    readonly sk: string;
  }): Effect.Effect<{ Item: IdbRecord | null }, IdbDBError, IdbDB>;
  putItem(record: IdbRecord): Effect.Effect<void, IdbDBError, IdbDB>;
  updateItem(
    key: { readonly pk: string; readonly sk: string },
    values: Record<string, unknown>,
    expectedU?: string,
  ): Effect.Effect<void, IdbDBError, IdbDB>;
  hardDeleteItem(key: {
    readonly pk: string;
    readonly sk: string;
  }): Effect.Effect<void, IdbDBError, IdbDB>;
  dangerouslyRemoveEntityItems(
    entityName: string,
    confirmation: 'I KNOW WHAT I AM DOING',
  ): Effect.Effect<{ itemsDeleted: number }, IdbDBError, IdbDB>;
  query(
    condition: { readonly pk: string; readonly sk?: SortKeyCondition },
    options?: { readonly Limit?: number; readonly ScanIndexForward?: boolean },
  ): Effect.Effect<{ Items: IdbRecord[] }, IdbDBError, IdbDB>;
  index(indexName: string): {
    query(
      condition: { readonly pk: string; readonly sk?: SortKeyCondition },
      options?: {
        readonly Limit?: number;
        readonly ScanIndexForward?: boolean;
      },
    ): Effect.Effect<{ Items: IdbRecord[] }, IdbDBError, IdbDB>;
  };
}
