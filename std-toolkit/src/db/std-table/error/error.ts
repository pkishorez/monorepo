import { Data } from 'effect';

export class ItemAlreadyExists extends Data.TaggedError('ItemAlreadyExists')<{
  readonly entity: string;
}> {}
export class NoItemToUpdate extends Data.TaggedError('NoItemToUpdate')<{
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
export class OperationFailed extends Data.TaggedError('OperationFailed')<{
  readonly operation: string;
  readonly cause: unknown;
}> {}

export type DatabaseErrorReason =
  | ItemAlreadyExists
  | NoItemToUpdate
  | PrimaryKeyUpdateNotSupported
  | ConditionFailed
  | InvalidQuery
  | TransactionTooLarge
  | DuplicateTransactionTarget
  | ForeignTransactionItem
  | DecodeFailed
  | OperationFailed;

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly reason: DatabaseErrorReason;
}> {}
