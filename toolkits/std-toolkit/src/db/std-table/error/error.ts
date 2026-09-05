import { Data } from 'effect';

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

export type TransactOutcomeStatus =
  | 'passed'
  | 'stale'
  | 'refused'
  | 'missing'
  | 'not-evaluated';

export interface TransactOutcome {
  readonly status: TransactOutcomeStatus;
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
export class EntityNotFound extends Data.TaggedError('EntityNotFound')<{
  readonly entity: string;
}> {}
export class PrimaryKeyDrift extends Data.TaggedError('PrimaryKeyDrift')<{
  readonly entity: string;
  readonly storedKey: { readonly pk: string; readonly sk: string };
  readonly currentKey: { readonly pk: string; readonly sk: string };
}> {}
export class ReindexConflict extends Data.TaggedError('ReindexConflict')<{
  readonly entity: string;
  readonly observedU: string;
}> {}

export type DatabaseErrorReason =
  | ItemAlreadyExists
  | NoItemToUpdate
  | NoItemToCheck
  | PrimaryKeyUpdateNotSupported
  | ConditionFailed
  | CheckRefused
  | InvalidQuery
  | TransactionTooLarge
  | DuplicateTransactionTarget
  | ForeignTransactionItem
  | TransactFailed
  | DecodeFailed
  | OperationFailed
  | EntityNotFound
  | PrimaryKeyDrift
  | ReindexConflict;

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly reason: DatabaseErrorReason;
}> {}
