import { Data } from 'effect';
import type { TableIdentity } from '../../domain/table-identity/index.js';

export interface TransactionFailureContext {
  readonly index: number;
  readonly entityName: string;
  readonly operationKind: 'insertOp' | 'updateOp' | 'deleteOp' | 'restoreOp';
  readonly writeKind: 'put' | 'update';
  readonly reasonCode: string;
  readonly message?: string;
}

export class TableBindingNotFound extends Data.TaggedError(
  'TableBindingNotFound',
)<{
  readonly table: TableIdentity;
}> {
  override get message(): string {
    return `No DynamoDB binding was provided for table "${this.table.logicalName}"`;
  }
}

export class DuplicateTableBinding extends Data.TaggedError(
  'DuplicateTableBinding',
)<{
  readonly table: TableIdentity;
}> {
  override get message(): string {
    return `Table "${this.table.logicalName}" has more than one DynamoDB binding`;
  }
}

export class GetItemFailed<Cause> extends Data.TaggedError('GetItemFailed')<{
  readonly cause: Cause;
}> {}

export class PutItemFailed<Cause> extends Data.TaggedError('PutItemFailed')<{
  readonly cause: Cause;
}> {}

export class UpdateItemFailed<Cause> extends Data.TaggedError(
  'UpdateItemFailed',
)<{
  readonly cause: Cause;
}> {}

export class DeleteItemFailed<Cause> extends Data.TaggedError(
  'DeleteItemFailed',
)<{
  readonly cause: Cause;
}> {}

export class QueryFailed<Cause> extends Data.TaggedError('QueryFailed')<{
  readonly cause: Cause;
}> {}

export class ScanFailed<Cause> extends Data.TaggedError('ScanFailed')<{
  readonly cause: Cause;
}> {}

export class DescribeFailed<Cause> extends Data.TaggedError('DescribeFailed')<{
  readonly cause: Cause;
}> {}

export class TransactionFailed<Cause> extends Data.TaggedError(
  'TransactionFailed',
)<{
  readonly cause: Cause;
}> {}

export class ConditionFailed<Cause> extends Data.TaggedError(
  'ConditionFailed',
)<{
  readonly cause: Cause;
  readonly failures: ReadonlyArray<TransactionFailureContext>;
}> {}

export class DuplicateTransactionTarget extends Data.TaggedError(
  'DuplicateTransactionTarget',
)<{
  readonly partitionKey: string;
  readonly sortKey: string;
}> {}

export class ForeignTransactionItem extends Data.TaggedError(
  'ForeignTransactionItem',
)<{
  readonly entityName: string;
}> {}

export class BatchWriteFailed<Cause> extends Data.TaggedError(
  'BatchWriteFailed',
)<{
  readonly cause: Cause;
}> {}

export class ItemAlreadyExists<Cause = never> extends Data.TaggedError(
  'ItemAlreadyExists',
)<{
  readonly cause?: Cause;
}> {}

export class NoItemToUpdate<Cause = never> extends Data.TaggedError(
  'NoItemToUpdate',
)<{
  readonly cause?: Cause;
}> {}

export class IdUpdateNotSupported extends Data.TaggedError(
  'IdUpdateNotSupported',
)<{
  readonly idField: string;
}> {}

export class ConditionCheckFailed<Cause = never> extends Data.TaggedError(
  'ConditionCheckFailed',
)<{
  readonly cause?: Cause;
  readonly message: string;
}> {}

export class ItemVersionMismatch<Cause = never> extends Data.TaggedError(
  'ItemVersionMismatch',
)<{
  readonly cause?: Cause;
}> {}

export class ItemMigrationFailed<Cause> extends Data.TaggedError(
  'ItemMigrationFailed',
)<{
  readonly cause: Cause;
}> {}

export class NoItemToDelete extends Data.TaggedError('NoItemToDelete')<{}> {}

export class NoItemToRestore extends Data.TaggedError('NoItemToRestore')<{}> {}

export type DynamoDBError =
  | TableBindingNotFound
  | DuplicateTableBinding
  | GetItemFailed<unknown>
  | PutItemFailed<unknown>
  | UpdateItemFailed<unknown>
  | DeleteItemFailed<unknown>
  | QueryFailed<unknown>
  | ScanFailed<unknown>
  | DescribeFailed<unknown>
  | TransactionFailed<unknown>
  | ConditionFailed<unknown>
  | DuplicateTransactionTarget
  | ForeignTransactionItem
  | BatchWriteFailed<unknown>
  | ItemAlreadyExists<unknown>
  | NoItemToUpdate<unknown>
  | IdUpdateNotSupported
  | ConditionCheckFailed<unknown>
  | ItemVersionMismatch<unknown>
  | ItemMigrationFailed<unknown>
  | NoItemToDelete
  | NoItemToRestore;

export const DynamoDBError = {
  getItemFailed: <Cause>(cause: Cause) => new GetItemFailed({ cause }),
  putItemFailed: <Cause>(cause: Cause) => new PutItemFailed({ cause }),
  updateItemFailed: <Cause>(cause: Cause) => new UpdateItemFailed({ cause }),
  deleteItemFailed: <Cause>(cause: Cause) => new DeleteItemFailed({ cause }),
  queryFailed: <Cause>(cause: Cause) => new QueryFailed({ cause }),
  scanFailed: <Cause>(cause: Cause) => new ScanFailed({ cause }),
  describeFailed: <Cause>(cause: Cause) => new DescribeFailed({ cause }),
  transactionFailed: <Cause>(cause: Cause) => new TransactionFailed({ cause }),
  conditionFailed: <Cause>(
    cause: Cause,
    failures: ReadonlyArray<TransactionFailureContext>,
  ) => new ConditionFailed({ cause, failures }),
  duplicateTransactionTarget: (partitionKey: string, sortKey: string) =>
    new DuplicateTransactionTarget({ partitionKey, sortKey }),
  foreignTransactionItem: (entityName: string) =>
    new ForeignTransactionItem({ entityName }),
  batchWriteFailed: <Cause>(cause: Cause) => new BatchWriteFailed({ cause }),
  itemAlreadyExists: <Cause = never>(cause?: Cause) =>
    new ItemAlreadyExists(cause === undefined ? {} : { cause }),
  noItemToUpdate: <Cause = never>(cause?: Cause) =>
    new NoItemToUpdate(cause === undefined ? {} : { cause }),
  idUpdateNotSupported: (idField: string) =>
    new IdUpdateNotSupported({ idField }),
  conditionCheckFailed: <Cause = never>(cause?: Cause) =>
    new ConditionCheckFailed({
      ...(cause === undefined ? {} : { cause }),
      message:
        'Conditional check failed: the item may not exist, or the provided condition was not met.',
    }),
  itemVersionMismatch: <Cause = never>(cause?: Cause) =>
    new ItemVersionMismatch(cause === undefined ? {} : { cause }),
  itemMigrationFailed: <Cause>(cause: Cause) =>
    new ItemMigrationFailed({ cause }),
  noItemToDelete: () => new NoItemToDelete(),
  noItemToRestore: () => new NoItemToRestore(),
} as const;
