import { OperationFailure } from '../../std-table/contract/index.js';

export const requestPromise = <Value>(request: IDBRequest<Value>) =>
  new Promise<Value>((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

export const nativeFailure = (cause: unknown) =>
  new OperationFailure({ cause });
