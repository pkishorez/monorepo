import { Data } from 'effect';

export type SqliteDBErrorType =
  | { _tag: 'CreateTableFailed'; table: string; cause: unknown }
  | { _tag: 'AddColumnFailed'; table: string; column: string; cause: unknown }
  | {
      _tag: 'CreateIndexFailed';
      table: string;
      indexName: string;
      cause: unknown;
    }
  | { _tag: 'InsertFailed'; table: string; cause: unknown }
  | { _tag: 'UpdateFailed'; table: string; cause: unknown }
  | { _tag: 'DeleteFailed'; table: string; cause: unknown }
  | { _tag: 'GetFailed'; table: string; cause: unknown }
  | { _tag: 'QueryFailed'; table: string; cause: unknown }
  | { _tag: 'ItemAlreadyExists'; table: string; cause: unknown }
  | { _tag: 'NoItemToUpdate'; table: string }
  | { _tag: 'NoItemToDelete'; table: string }
  | { _tag: 'NoItemToRestore'; table: string }
  | { _tag: 'BeginFailed'; cause: unknown }
  | { _tag: 'CommitFailed'; cause: unknown }
  | { _tag: 'RollbackFailed'; cause: unknown }
  | { _tag: 'ConditionFailed'; table: string; key: { pk: string; sk: string } };

export class SqliteDBError extends Data.TaggedError('SqliteDBError')<{
  error: SqliteDBErrorType;
}> {
  static createTableFailed(table: string, cause: unknown) {
    return new SqliteDBError({
      error: { _tag: 'CreateTableFailed', table, cause },
    });
  }

  static addColumnFailed(table: string, column: string, cause: unknown) {
    return new SqliteDBError({
      error: { _tag: 'AddColumnFailed', table, column, cause },
    });
  }

  static createIndexFailed(table: string, indexName: string, cause: unknown) {
    return new SqliteDBError({
      error: { _tag: 'CreateIndexFailed', table, indexName, cause },
    });
  }

  static insertFailed(table: string, cause: unknown) {
    return new SqliteDBError({ error: { _tag: 'InsertFailed', table, cause } });
  }

  static updateFailed(table: string, cause: unknown) {
    return new SqliteDBError({ error: { _tag: 'UpdateFailed', table, cause } });
  }

  static deleteFailed(table: string, cause: unknown) {
    return new SqliteDBError({ error: { _tag: 'DeleteFailed', table, cause } });
  }

  static getFailed(table: string, cause: unknown) {
    return new SqliteDBError({ error: { _tag: 'GetFailed', table, cause } });
  }

  static queryFailed(table: string, cause: unknown) {
    return new SqliteDBError({ error: { _tag: 'QueryFailed', table, cause } });
  }

  static itemAlreadyExists(table: string, cause: unknown) {
    return new SqliteDBError({
      error: { _tag: 'ItemAlreadyExists', table, cause },
    });
  }

  static noItemToUpdate(table: string) {
    return new SqliteDBError({ error: { _tag: 'NoItemToUpdate', table } });
  }

  static noItemToDelete(table: string) {
    return new SqliteDBError({ error: { _tag: 'NoItemToDelete', table } });
  }

  static noItemToRestore(table: string) {
    return new SqliteDBError({ error: { _tag: 'NoItemToRestore', table } });
  }

  static beginFailed(cause: unknown) {
    return new SqliteDBError({ error: { _tag: 'BeginFailed', cause } });
  }

  static commitFailed(cause: unknown) {
    return new SqliteDBError({ error: { _tag: 'CommitFailed', cause } });
  }

  static rollbackFailed(cause: unknown) {
    return new SqliteDBError({ error: { _tag: 'RollbackFailed', cause } });
  }

  static conditionFailed(table: string, key: { pk: string; sk: string }) {
    return new SqliteDBError({
      error: { _tag: 'ConditionFailed', table, key },
    });
  }
}
