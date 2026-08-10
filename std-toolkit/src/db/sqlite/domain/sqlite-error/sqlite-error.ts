import { Data } from 'effect';
import {
  PersistenceError,
  type PersistenceErrorType,
} from '../../../domain/persistence-error/index.js';

export class CreateTableFailed extends Data.TaggedError('CreateTableFailed')<{
  readonly table: string;
  readonly cause: unknown;
}> {}

export class AddColumnFailed extends Data.TaggedError('AddColumnFailed')<{
  readonly table: string;
  readonly column: string;
  readonly cause: unknown;
}> {}

export class CreateIndexFailed extends Data.TaggedError('CreateIndexFailed')<{
  readonly table: string;
  readonly indexName: string;
  readonly cause: unknown;
}> {}

export class InsertFailed extends Data.TaggedError('InsertFailed')<{
  readonly table: string;
  readonly cause: unknown;
}> {}

export class UpdateFailed extends Data.TaggedError('UpdateFailed')<{
  readonly table: string;
  readonly cause: unknown;
}> {}

export class DeleteFailed extends Data.TaggedError('DeleteFailed')<{
  readonly table: string;
  readonly cause: unknown;
}> {}

export class GetFailed extends Data.TaggedError('GetFailed')<{
  readonly table: string;
  readonly cause: unknown;
}> {}

export class QueryFailed extends Data.TaggedError('QueryFailed')<{
  readonly table: string;
  readonly cause: unknown;
}> {}

export class BeginFailed extends Data.TaggedError('BeginFailed')<{
  readonly cause: unknown;
}> {}

export class CommitFailed extends Data.TaggedError('CommitFailed')<{
  readonly cause: unknown;
}> {}

export class RollbackFailed extends Data.TaggedError('RollbackFailed')<{
  readonly cause: unknown;
}> {}

type SQLiteOperationError =
  | CreateTableFailed
  | AddColumnFailed
  | CreateIndexFailed
  | InsertFailed
  | UpdateFailed
  | DeleteFailed
  | GetFailed
  | QueryFailed
  | BeginFailed
  | CommitFailed
  | RollbackFailed;

export type SQLiteError = SQLiteOperationError | PersistenceErrorType;

export const SQLiteError = {
  createTableFailed: (table: string, cause: unknown) =>
    new CreateTableFailed({ table, cause }),
  addColumnFailed: (table: string, column: string, cause: unknown) =>
    new AddColumnFailed({ table, column, cause }),
  createIndexFailed: (table: string, indexName: string, cause: unknown) =>
    new CreateIndexFailed({ table, indexName, cause }),
  insertFailed: (table: string, cause: unknown) =>
    new InsertFailed({ table, cause }),
  updateFailed: (table: string, cause: unknown) =>
    new UpdateFailed({ table, cause }),
  deleteFailed: (table: string, cause: unknown) =>
    new DeleteFailed({ table, cause }),
  getFailed: (table: string, cause: unknown) => new GetFailed({ table, cause }),
  queryFailed: (table: string, cause: unknown) =>
    new QueryFailed({ table, cause }),
  beginFailed: (cause: unknown) => new BeginFailed({ cause }),
  commitFailed: (cause: unknown) => new CommitFailed({ cause }),
  rollbackFailed: (cause: unknown) => new RollbackFailed({ cause }),
  itemAlreadyExists: (table: string, cause?: unknown) =>
    PersistenceError.itemAlreadyExists(cause, { tableName: table }),
  noItemToUpdate: (table: string) =>
    PersistenceError.noItemToUpdate(undefined, { tableName: table }),
  noItemToDelete: (table: string) =>
    PersistenceError.noItemToDelete({ tableName: table }),
  noItemToRestore: (table: string) =>
    PersistenceError.noItemToRestore({ tableName: table }),
  conditionFailed: (
    table: string,
    key: { readonly pk: string; readonly sk: string },
    cause?: unknown,
  ) =>
    PersistenceError.conditionFailed(cause, [
      {
        tableName: table,
        partitionKey: key.pk,
        sortKey: key.sk,
      },
    ]),
  duplicateTransactionTarget: PersistenceError.duplicateTransactionTarget,
  foreignTransactionItem: PersistenceError.foreignTransactionItem,
} as const;
