import { StdToolkitError } from '../../../core/index.js';

/**
 * Discriminates {@link IdbDBError} failures. `conditionFailed` is the one
 * callers (the Entity layer) branch on to treat an optimistic-write conflict
 * as retryable.
 */
export type IdbDBErrorCode =
  | 'openFailed'
  | 'setupFailed'
  | 'getFailed'
  | 'putFailed'
  | 'deleteFailed'
  | 'clearFailed'
  | 'transactFailed'
  | 'conditionFailed'
  | 'noItemToUpdate'
  | 'noItemToRestore'
  | 'noItemToDelete'
  | 'queryFailed';

const describeCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * Failure type for {@link IdbDB} operations. Extends core's `StdToolkitError`;
 * distinguish failure kinds via `error.code` (see {@link IdbDBErrorCode}).
 */
export class IdbDBError extends StdToolkitError {
  static openFailed(cause: unknown) {
    return new IdbDBError({
      message: `IndexedDB open failed: ${describeCause(cause)}`,
      code: 'openFailed' satisfies IdbDBErrorCode,
    });
  }

  static setupFailed(tableName: string, cause: unknown) {
    return new IdbDBError({
      message: `IndexedDB setup failed for table "${tableName}": ${describeCause(cause)}`,
      code: 'setupFailed' satisfies IdbDBErrorCode,
    });
  }

  static getFailed(tableName: string, cause: unknown) {
    return new IdbDBError({
      message: `IndexedDB get failed on table "${tableName}": ${describeCause(cause)}`,
      code: 'getFailed' satisfies IdbDBErrorCode,
    });
  }

  static putFailed(tableName: string, cause: unknown) {
    return new IdbDBError({
      message: `IndexedDB put failed on table "${tableName}": ${describeCause(cause)}`,
      code: 'putFailed' satisfies IdbDBErrorCode,
    });
  }

  static deleteFailed(tableName: string, cause: unknown) {
    return new IdbDBError({
      message: `IndexedDB delete failed on table "${tableName}": ${describeCause(cause)}`,
      code: 'deleteFailed' satisfies IdbDBErrorCode,
    });
  }

  static clearFailed(tableName: string, cause: unknown) {
    return new IdbDBError({
      message: `IndexedDB clear failed on table "${tableName}": ${describeCause(cause)}`,
      code: 'clearFailed' satisfies IdbDBErrorCode,
    });
  }

  static transactFailed(tableName: string, cause: unknown) {
    return new IdbDBError({
      message: `IndexedDB transact failed on table "${tableName}": ${describeCause(cause)}`,
      code: 'transactFailed' satisfies IdbDBErrorCode,
    });
  }

  static conditionFailed(tableName: string, key: { pk: string; sk: string }) {
    return new IdbDBError({
      message: `IndexedDB condition check failed on table "${tableName}" for key pk=${key.pk} sk=${key.sk}`,
      code: 'conditionFailed' satisfies IdbDBErrorCode,
    });
  }

  /** No matching entity to update — mirrors `SqliteDBError.noItemToUpdate`. */
  static noItemToUpdate(tableName: string) {
    return new IdbDBError({
      message: `No item to update on table "${tableName}"`,
      code: 'noItemToUpdate' satisfies IdbDBErrorCode,
    });
  }

  /** No matching tombstone to restore. */
  static noItemToRestore(tableName: string) {
    return new IdbDBError({
      message: `No item to restore on table "${tableName}"`,
      code: 'noItemToRestore' satisfies IdbDBErrorCode,
    });
  }

  /** No matching entity to delete — mirrors `SqliteDBError.noItemToDelete`. */
  static noItemToDelete(tableName: string) {
    return new IdbDBError({
      message: `No item to delete on table "${tableName}"`,
      code: 'noItemToDelete' satisfies IdbDBErrorCode,
    });
  }

  /** Query referenced an index that isn't declared on the entity. */
  static queryFailed(tableName: string, cause: unknown) {
    return new IdbDBError({
      message: `IndexedDB query failed on table "${tableName}": ${describeCause(cause)}`,
      code: 'queryFailed' satisfies IdbDBErrorCode,
    });
  }
}
