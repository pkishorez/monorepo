import { Data } from 'effect';
import { unmarshall } from '../attribute-value/index.js';
import type { TableIdentity } from '../table-identity/index.js';
import {
  ConditionFailed,
  DuplicateTransactionTarget,
  ForeignTransactionItem,
  ItemAlreadyExists,
  NoItemToDelete,
  NoItemToRestore,
  NoItemToUpdate,
  PersistenceError,
  type PersistenceFailureContext,
} from '../../../domain/persistence-error/index.js';

export type TransactionFailureContext = PersistenceFailureContext & {
  readonly index: number;
  readonly entityName: string;
  readonly operationKind: 'insertOp' | 'updateOp' | 'deleteOp' | 'restoreOp';
  readonly writeKind: 'put' | 'update';
  readonly reasonCode: string;
};

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

export class BatchWriteFailed<Cause> extends Data.TaggedError(
  'BatchWriteFailed',
)<{
  readonly cause: Cause;
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

export const isConditionalCheckFailed = (error: {
  readonly cause?: unknown;
}): boolean => {
  const cause = error.cause as { readonly _tag?: string } | undefined;
  return cause?._tag === 'ConditionalCheckFailedException';
};

export const extractConditionFailureItem = (error: {
  readonly cause?: unknown;
}): Record<string, unknown> | undefined => {
  const cause = error.cause as
    | { readonly Item?: Record<string, never> }
    | undefined;
  return cause?.Item ? unmarshall(cause.Item) : undefined;
};

export const DynamoDBError = {
  ...PersistenceError,
  getItemFailed: <Cause>(cause: Cause) => new GetItemFailed({ cause }),
  putItemFailed: <Cause>(cause: Cause) => new PutItemFailed({ cause }),
  updateItemFailed: <Cause>(cause: Cause) => new UpdateItemFailed({ cause }),
  deleteItemFailed: <Cause>(cause: Cause) => new DeleteItemFailed({ cause }),
  queryFailed: <Cause>(cause: Cause) => new QueryFailed({ cause }),
  scanFailed: <Cause>(cause: Cause) => new ScanFailed({ cause }),
  describeFailed: <Cause>(cause: Cause) => new DescribeFailed({ cause }),
  transactionFailed: <Cause>(cause: Cause) => new TransactionFailed({ cause }),
  batchWriteFailed: <Cause>(cause: Cause) => new BatchWriteFailed({ cause }),
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
} as const;

export {
  ConditionFailed,
  DuplicateTransactionTarget,
  ForeignTransactionItem,
  ItemAlreadyExists,
  NoItemToDelete,
  NoItemToRestore,
  NoItemToUpdate,
};
