import { StdToolkitError } from '../../../../core/index.js';
import {
  PersistenceError,
  type PersistenceErrorType,
} from '../../../domain/persistence-error/index.js';

export type IdbDBErrorCode =
  | 'openFailed'
  | 'setupFailed'
  | 'getFailed'
  | 'putFailed'
  | 'deleteFailed'
  | 'clearFailed'
  | 'transactFailed'
  | 'queryFailed';

const describeCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

export class IdbOperationError extends StdToolkitError {}

export type IdbDBError = IdbOperationError | PersistenceErrorType;

const operationError = (code: IdbDBErrorCode, message: string) =>
  new IdbOperationError({ message, code });

export const IdbDBError = {
  openFailed: (cause: unknown) =>
    operationError(
      'openFailed',
      `IndexedDB open failed: ${describeCause(cause)}`,
    ),
  setupFailed: (storeName: string, cause: unknown) =>
    operationError(
      'setupFailed',
      `IndexedDB setup failed for store "${storeName}": ${describeCause(cause)}`,
    ),
  getFailed: (storeName: string, cause: unknown) =>
    operationError(
      'getFailed',
      `IndexedDB get failed on store "${storeName}": ${describeCause(cause)}`,
    ),
  putFailed: (storeName: string, cause: unknown) =>
    operationError(
      'putFailed',
      `IndexedDB put failed on store "${storeName}": ${describeCause(cause)}`,
    ),
  deleteFailed: (storeName: string, cause: unknown) =>
    operationError(
      'deleteFailed',
      `IndexedDB delete failed on store "${storeName}": ${describeCause(cause)}`,
    ),
  clearFailed: (storeName: string, cause: unknown) =>
    operationError(
      'clearFailed',
      `IndexedDB clear failed on store "${storeName}": ${describeCause(cause)}`,
    ),
  transactFailed: (storeName: string, cause: unknown) =>
    operationError(
      'transactFailed',
      `IndexedDB transaction failed on store "${storeName}": ${describeCause(cause)}`,
    ),
  queryFailed: (storeName: string, cause: unknown) =>
    operationError(
      'queryFailed',
      `IndexedDB query failed on store "${storeName}": ${describeCause(cause)}`,
    ),
  conditionFailed: (
    storeName: string,
    key: { readonly pk: string; readonly sk: string },
    cause?: unknown,
  ) =>
    PersistenceError.conditionFailed(cause, [
      {
        tableName: storeName,
        partitionKey: key.pk,
        sortKey: key.sk,
      },
    ]),
  noItemToUpdate: (storeName: string) =>
    PersistenceError.noItemToUpdate(undefined, { tableName: storeName }),
  itemAlreadyExists: (storeName: string, cause?: unknown) =>
    PersistenceError.itemAlreadyExists(cause, { tableName: storeName }),
  noItemToRestore: (storeName: string) =>
    PersistenceError.noItemToRestore({ tableName: storeName }),
  noItemToDelete: (storeName: string) =>
    PersistenceError.noItemToDelete({ tableName: storeName }),
  duplicateTransactionTarget: PersistenceError.duplicateTransactionTarget,
  foreignTransactionItem: PersistenceError.foreignTransactionItem,
} as const;
