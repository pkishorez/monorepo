import type {
  EncodedItem,
  QueryPosition,
  QueryRequest,
} from '../../std-table/contract/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import { Schema } from 'effect';
import { itemSchema } from '../item-schema/index.js';

type CursorKey = [string, string];

interface CursorPosition {
  readonly key: CursorKey;
  readonly primaryKey: CursorKey;
}

const queryKeyRange = ({ pk, sort }: QueryRequest) => {
  const first: CursorKey = [pk, ''];
  const last: readonly [string, never[]] = [pk, []];
  if (sort === undefined) return IDBKeyRange.bound(first, last);
  if (sort.operator === 'between')
    return IDBKeyRange.bound([pk, sort.value[0]], [pk, sort.value[1]]);
  if (sort.operator === 'beginsWith')
    return IDBKeyRange.bound([pk, sort.value], [pk, `${sort.value}\uffff`]);
  if (sort.operator === '=') return IDBKeyRange.only([pk, sort.value]);
  if (sort.operator === '<')
    return IDBKeyRange.bound(first, [pk, sort.value], false, true);
  if (sort.operator === '<=') return IDBKeyRange.bound(first, [pk, sort.value]);
  if (sort.operator === '>')
    return IDBKeyRange.bound([pk, sort.value], last, true);
  return IDBKeyRange.bound([pk, sort.value], last);
};

const cursorPosition = (
  query: QueryRequest,
  startAfter: QueryPosition,
): CursorPosition => {
  const primaryKey: CursorKey = [startAfter.pk, startAfter.sk];
  return query.index !== undefined && startAfter.indexSk !== undefined
    ? { key: [query.pk, startAfter.indexSk], primaryKey }
    : { key: primaryKey, primaryKey };
};

const comparePosition = (
  cursor: IDBCursor,
  position: CursorPosition,
  compare: (left: IDBValidKey, right: IDBValidKey) => number,
) => {
  const keyComparison = compare(cursor.key, position.key);
  return keyComparison === 0
    ? compare(cursor.primaryKey, position.primaryKey)
    : keyComparison;
};

const isBeforePosition = (
  cursor: IDBCursor,
  position: CursorPosition,
  descending: boolean,
  compare: (left: IDBValidKey, right: IDBValidKey) => number,
) => {
  const comparison = comparePosition(cursor, position, compare);
  return descending ? comparison > 0 : comparison < 0;
};

const seekAfterPosition = (
  cursor: IDBCursorWithValue,
  position: CursorPosition,
  indexed: boolean,
  descending: boolean,
  compare: (left: IDBValidKey, right: IDBValidKey) => number,
) => {
  if (isBeforePosition(cursor, position, descending, compare)) {
    if (indexed) cursor.continuePrimaryKey(position.key, position.primaryKey);
    else cursor.continue(position.key);
    return false;
  }
  if (
    compare(cursor.key, position.key) === 0 &&
    compare(cursor.primaryKey, position.primaryKey) === 0
  ) {
    cursor.continue();
    return false;
  }
  return true;
};

export const queryItems = async (
  database: IDBDatabase,
  table: Pick<
    TableDefinition,
    'localSecondaryIndexes' | 'globalSecondaryIndexes'
  >,
  storeName: string,
  query: QueryRequest,
  compare: (left: IDBValidKey, right: IDBValidKey) => number,
) => {
  const encodeItem = Schema.encodeSync(itemSchema(table));
  if (query.limit <= 0) return { items: [], hasMore: false };
  const position =
    query.startAfter === undefined
      ? undefined
      : cursorPosition(query, query.startAfter);
  const store = database.transaction(storeName).objectStore(storeName);
  const source: IDBIndex | IDBObjectStore =
    query.index === undefined ? store : store.index(query.index);
  const request = source.openCursor(
    queryKeyRange(query),
    query.descending ? 'prev' : 'next',
  );
  const selected = await new Promise<EncodedItem[]>((resolve, reject) => {
    const items: EncodedItem[] = [];
    let resumed = position === undefined;
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor === null || items.length > query.limit) return resolve(items);
      if (
        !resumed &&
        position !== undefined &&
        !seekAfterPosition(
          cursor,
          position,
          query.index !== undefined,
          query.descending,
          compare,
        )
      )
        return;
      resumed = true;
      items.push(encodeItem(cursor.value as Record<string, unknown>));
      if (items.length > query.limit) return resolve(items);
      cursor.continue();
    };
  });
  return {
    items: selected.slice(0, query.limit),
    hasMore: selected.length > query.limit,
  };
};
