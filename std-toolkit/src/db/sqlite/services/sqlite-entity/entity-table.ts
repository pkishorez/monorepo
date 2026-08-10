import type { Effect } from 'effect';
import type { RawRow } from '../../domain/entity-persistence/index.js';
import type { Where } from '../../domain/sql-statement/index.js';
import type { SQLiteDatabase } from '../sqlite-database/index.js';
import type { SQLiteError } from '../../domain/sqlite-error/index.js';

export type SortKeyCondition =
  | { '<': string }
  | { '<=': string }
  | { '>': string }
  | { '>=': string }
  | { '=': string }
  | { between: [string, string] }
  | { beginsWith: string };

export interface SQLiteEntityTable {
  readonly tableName: string;
  readonly primary: { readonly pk: string; readonly sk: string };
  readonly secondaryIndexMap: Record<
    string,
    { readonly pk: string; readonly sk: string }
  >;
  getItem(key: {
    readonly pk: string;
    readonly sk: string;
  }): Effect.Effect<{ Item: RawRow | null }, SQLiteError, SQLiteDatabase>;
  putItem(
    value: Record<string, unknown>,
  ): Effect.Effect<void, SQLiteError, SQLiteDatabase>;
  updateItem(
    key: { readonly pk: string; readonly sk: string },
    values: Record<string, unknown>,
  ): Effect.Effect<void, SQLiteError, SQLiteDatabase>;
  delete(
    where: Where,
  ): Effect.Effect<{ rowsDeleted: number }, SQLiteError, SQLiteDatabase>;
  dangerouslyRemoveEntityItems(
    entityName: string,
    confirmation: 'I KNOW WHAT I AM DOING',
  ): Effect.Effect<{ itemsDeleted: number }, SQLiteError, SQLiteDatabase>;
  query(
    condition: { readonly pk: string; readonly sk?: SortKeyCondition },
    options?: { readonly Limit?: number; readonly ScanIndexForward?: boolean },
  ): Effect.Effect<{ Items: RawRow[] }, SQLiteError, SQLiteDatabase>;
  index(indexName: string): {
    query(
      condition: { readonly pk: string; readonly sk?: SortKeyCondition },
      options?: {
        readonly Limit?: number;
        readonly ScanIndexForward?: boolean;
      },
    ): Effect.Effect<{ Items: RawRow[] }, SQLiteError, SQLiteDatabase>;
  };
}
