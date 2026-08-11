export type OfflineStorageError = {
  _tag: 'OfflineStorageError';
  operation: 'get' | 'getAll' | 'put' | 'putMany' | 'delete' | 'clear' | 'open';
  cause: unknown;
};

export const offlineStorageError = (
  operation: OfflineStorageError['operation'],
  cause: unknown,
): OfflineStorageError => ({
  _tag: 'OfflineStorageError',
  operation,
  cause,
});
