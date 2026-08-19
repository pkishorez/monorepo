import { Data } from 'effect';
import type { ItemOutcomeStatus } from '../contract/index.js';

export class ItemAlreadyExists extends Data.TaggedError('ItemAlreadyExists')<{
  readonly entity: string;
}> {}
export class NoItemToUpdate extends Data.TaggedError('NoItemToUpdate')<{
  readonly entity: string;
}> {}
export class NoItemToCheck extends Data.TaggedError('NoItemToCheck')<{
  readonly entity: string;
}> {}
export class PrimaryKeyUpdateNotSupported extends Data.TaggedError(
  'PrimaryKeyUpdateNotSupported',
)<{
  readonly entity: string;
  readonly fields: readonly string[];
}> {}
export class ConditionFailed extends Data.TaggedError('ConditionFailed')<{
  readonly entity: string;
}> {}
export class UpdateRefused extends Data.TaggedError('UpdateRefused')<{
  readonly entity: string;
}> {}
export class CheckRefused extends Data.TaggedError('CheckRefused')<{
  readonly entity: string;
}> {}
export class InvalidQuery extends Data.TaggedError('InvalidQuery')<{
  readonly message: string;
}> {}
export class TransactionTooLarge extends Data.TaggedError(
  'TransactionTooLarge',
)<{ readonly count: number; readonly maximum: 100 }> {}
export class DuplicateTransactionTarget extends Data.TaggedError(
  'DuplicateTransactionTarget',
)<{ readonly target: string }> {}
export class ForeignTransactionItem extends Data.TaggedError(
  'ForeignTransactionItem',
)<{ readonly expectedTable: string; readonly actualTable: string }> {}
export class DecodeFailed extends Data.TaggedError('DecodeFailed')<{
  readonly entity: string;
  readonly cause: Error;
}> {}
// Structural stand-in for the submitted op: `error` sits below `entity`, so it
// cannot name `AnyTransactOp` without a cycle. The op itself is passed through,
// so reference identity with what the caller handed to `transact` holds.
export interface TransactOperation {
  readonly tableName: string;
  readonly entityName: string;
  readonly key: { readonly pk: string; readonly sk: string };
  readonly target: string;
  readonly operationKind: string;
}

export interface TransactOutcome {
  readonly status: ItemOutcomeStatus;
  readonly detail?: string;
  readonly op: TransactOperation;
}

export class TransactFailed extends Data.TaggedError('TransactFailed')<{
  readonly operations: readonly TransactOutcome[];
}> {}
export class OperationFailed extends Data.TaggedError('OperationFailed')<{
  readonly operation: string;
  readonly cause: unknown;
}> {}

export type DatabaseErrorReason =
  | ItemAlreadyExists
  | NoItemToUpdate
  | NoItemToCheck
  | PrimaryKeyUpdateNotSupported
  | ConditionFailed
  | UpdateRefused
  | CheckRefused
  | InvalidQuery
  | TransactionTooLarge
  | DuplicateTransactionTarget
  | ForeignTransactionItem
  | TransactFailed
  | DecodeFailed
  | OperationFailed;

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly reason: DatabaseErrorReason;
}> {}
