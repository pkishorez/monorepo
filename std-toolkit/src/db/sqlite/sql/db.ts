import { Context, Effect, Option } from 'effect';
import type { Where } from './helpers/index.js';
import type { EntityType } from '../../../core/index.js';
import { SqliteDBError } from '../errors.js';

export { SqliteDBError, type SqliteDBErrorType } from '../errors.js';

export const TransactionPendingBroadcasts = Context.Reference<
  Option.Option<Array<EntityType<unknown>>>
>('TransactionPendingBroadcasts', { defaultValue: () => Option.none() });

export class SqliteDB extends Context.Service<
  SqliteDB,
  {
    /** The physical table name this connection is bound to. */
    readonly tableName: string;

    createTable(
      table: string,
      columns: string[],
      primaryKey: string[],
    ): Effect.Effect<void, SqliteDBError>;

    addColumn(
      table: string,
      column: string,
      type: string,
    ): Effect.Effect<void, SqliteDBError>;

    createIndex(
      table: string,
      indexName: string,
      columns: string[],
    ): Effect.Effect<void, SqliteDBError>;

    insert(
      table: string,
      values: Record<string, unknown>,
    ): Effect.Effect<{ rowsWritten: number }, SqliteDBError>;

    update(
      table: string,
      values: Record<string, unknown>,
      where: Where,
    ): Effect.Effect<{ rowsWritten: number }, SqliteDBError>;

    delete(
      table: string,
      where: Where,
    ): Effect.Effect<{ rowsDeleted: number }, SqliteDBError>;

    deleteAll(
      table: string,
    ): Effect.Effect<{ rowsDeleted: number }, SqliteDBError>;

    get<T extends Record<string, unknown>>(
      table: string,
      where: Where,
    ): Effect.Effect<T, SqliteDBError>;

    query<T extends Record<string, unknown>>(
      table: string,
      where: Where,
      options?: {
        orderBy?: 'ASC' | 'DESC';
        orderByColumn?: string;
        limit?: number;
        offset?: number;
      },
    ): Effect.Effect<T[], SqliteDBError>;

    begin(): Effect.Effect<void, SqliteDBError>;
    commit(): Effect.Effect<void, SqliteDBError>;
    rollback(): Effect.Effect<void, SqliteDBError>;
  }
>()('SqliteDB') {}
