import { Data } from 'effect';

export type TransactOperationKind =
  | 'insertOp'
  | 'updateOp'
  | 'deleteOp'
  | 'restoreOp';

export interface PersistenceTarget {
  readonly tableName?: string;
  readonly entityName?: string;
  readonly partitionKey?: string;
  readonly sortKey?: string;
  readonly operationKind?: TransactOperationKind;
}

export interface PersistenceFailureContext extends PersistenceTarget {
  readonly index?: number;
  readonly writeKind?: 'put' | 'update';
  readonly reasonCode?: string;
  readonly message?: string;
}

export class ConditionFailed<Cause = never> extends Data.TaggedError(
  'ConditionFailed',
)<{
  readonly cause?: Cause;
  readonly failures: ReadonlyArray<PersistenceFailureContext>;
}> {}

export class DuplicateTransactionTarget extends Data.TaggedError(
  'DuplicateTransactionTarget',
)<
  PersistenceTarget & {
    readonly partitionKey: string;
    readonly sortKey: string;
  }
> {}

export class ForeignTransactionItem extends Data.TaggedError(
  'ForeignTransactionItem',
)<PersistenceTarget & { readonly entityName: string }> {}

export class ItemAlreadyExists<Cause = never> extends Data.TaggedError(
  'ItemAlreadyExists',
)<PersistenceTarget & { readonly cause?: Cause }> {}

export class NoItemToUpdate<Cause = never> extends Data.TaggedError(
  'NoItemToUpdate',
)<PersistenceTarget & { readonly cause?: Cause }> {}

export class NoItemToDelete extends Data.TaggedError(
  'NoItemToDelete',
)<PersistenceTarget> {}

export class NoItemToRestore extends Data.TaggedError(
  'NoItemToRestore',
)<PersistenceTarget> {}

export type PersistenceError =
  | ConditionFailed<unknown>
  | DuplicateTransactionTarget
  | ForeignTransactionItem
  | ItemAlreadyExists<unknown>
  | NoItemToUpdate<unknown>
  | NoItemToDelete
  | NoItemToRestore;

const withCause = <Cause>(
  cause: Cause | undefined,
  target: PersistenceTarget,
): PersistenceTarget & { readonly cause?: Cause } =>
  cause === undefined ? target : { ...target, cause };

export const PersistenceError = {
  conditionFailed: <Cause = never>(
    cause: Cause | undefined,
    failures: ReadonlyArray<PersistenceFailureContext>,
  ) =>
    new ConditionFailed(
      cause === undefined ? { failures } : { cause, failures },
    ),
  duplicateTransactionTarget: (
    partitionKey: string,
    sortKey: string,
    target: Omit<PersistenceTarget, 'partitionKey' | 'sortKey'> = {},
  ) =>
    new DuplicateTransactionTarget({
      ...target,
      partitionKey,
      sortKey,
    }),
  foreignTransactionItem: (
    entityName: string,
    target: Omit<PersistenceTarget, 'entityName'> = {},
  ) => new ForeignTransactionItem({ ...target, entityName }),
  itemAlreadyExists: <Cause = never>(
    cause?: Cause,
    target: PersistenceTarget = {},
  ) => new ItemAlreadyExists(withCause(cause, target)),
  noItemToUpdate: <Cause = never>(
    cause?: Cause,
    target: PersistenceTarget = {},
  ) => new NoItemToUpdate(withCause(cause, target)),
  noItemToDelete: (target: PersistenceTarget = {}) =>
    new NoItemToDelete(target),
  noItemToRestore: (target: PersistenceTarget = {}) =>
    new NoItemToRestore(target),
} as const;
