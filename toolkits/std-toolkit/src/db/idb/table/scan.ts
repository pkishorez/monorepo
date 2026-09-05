import { Schema } from 'effect';
import type {
  EncodedItem,
  ScanRequest,
} from '../../std-table/contract/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import { decodeKey, itemSchema } from '../item-schema/index.js';

export const scanItems = async (
  database: IDBDatabase,
  table: Pick<
    TableDefinition,
    'localSecondaryIndexes' | 'globalSecondaryIndexes'
  >,
  storeName: string,
  request: ScanRequest,
) => {
  if (request.segment !== undefined && request.segment > 0)
    return { items: [], hasMore: false };
  if (request.limit <= 0) return { items: [], hasMore: false };
  const encodeItem = Schema.encodeSync(itemSchema(table));
  const store = database.transaction(storeName).objectStore(storeName);
  const range =
    request.startAfter === undefined
      ? undefined
      : IDBKeyRange.lowerBound(decodeKey(request.startAfter), true);
  const cursorRequest = store.openCursor(range, 'next');
  const collected = await new Promise<EncodedItem[]>((resolve, reject) => {
    const items: EncodedItem[] = [];
    cursorRequest.onerror = () => reject(cursorRequest.error);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor === null || items.length > request.limit)
        return resolve(items);
      items.push(encodeItem(cursor.value as Record<string, unknown>));
      if (items.length > request.limit) return resolve(items);
      cursor.continue();
    };
  });
  return {
    items: collected.slice(0, request.limit),
    hasMore: collected.length > request.limit,
  };
};
