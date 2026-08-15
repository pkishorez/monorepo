import { Effect } from 'effect';
import type { TableDefinition } from '../../std-table/definition/index.js';
import {
  ConditionFailure,
  OperationFailure,
  type ConditionalPut,
  type EncodedItem,
  type EncodedKey,
  type JsonObject,
  type JsonValue,
  type QueryRequest,
  type StdTableContract,
} from '../../std-table/contract/index.js';

type MemoryTable = Pick<
  TableDefinition,
  'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

interface OrderedItem {
  readonly item: EncodedItem;
  readonly partitionKey: string;
  readonly sortKey: string;
}

const target = ({ pk, sk }: EncodedKey): string => JSON.stringify([pk, sk]);

const compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const cloneJson = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, cloneJson(nested)]),
  ) as JsonObject;
};

const cloneItem = (item: EncodedItem): EncodedItem => ({
  pk: item.pk,
  sk: item.sk,
  meta: { ...item.meta },
  data: cloneJson(item.data) as JsonObject,
  keys: { ...item.keys },
});

const matchesSort = (sortKey: string, sort: QueryRequest['sort']): boolean => {
  if (sort === undefined) return true;
  if (sort.operator === 'between')
    return sortKey >= sort.value[0] && sortKey <= sort.value[1];
  if (sort.operator === 'beginsWith') return sortKey.startsWith(sort.value);
  if (sort.operator === '=') return sortKey === sort.value;
  if (sort.operator === '<') return sortKey < sort.value;
  if (sort.operator === '<=') return sortKey <= sort.value;
  if (sort.operator === '>') return sortKey > sort.value;
  return sortKey >= sort.value;
};

const orderedItem = (
  table: MemoryTable,
  item: EncodedItem,
  index: string | undefined,
): OrderedItem | undefined => {
  if (index === undefined)
    return { item, partitionKey: item.pk, sortKey: item.sk };

  const lsi = table.localSecondaryIndexes[index];
  if (lsi !== undefined) {
    const sortKey = item.keys[lsi.sk];
    return sortKey === undefined
      ? undefined
      : { item, partitionKey: item.pk, sortKey };
  }

  const gsi = table.globalSecondaryIndexes[index];
  if (gsi !== undefined) {
    const partitionKey = item.keys[gsi.pk];
    const sortKey = item.keys[gsi.sk];
    return partitionKey === undefined || sortKey === undefined
      ? undefined
      : { item, partitionKey, sortKey };
  }

  throw new Error(`Unknown index "${index}"`);
};

const compareOrdered = (left: OrderedItem, right: OrderedItem): number =>
  compare(left.sortKey, right.sortKey) ||
  compare(left.item.pk, right.item.pk) ||
  compare(left.item.sk, right.item.sk);

const comparePosition = (
  entry: OrderedItem,
  startAfter: NonNullable<QueryRequest['startAfter']>,
): number =>
  compare(entry.sortKey, startAfter.indexSk ?? startAfter.sk) ||
  compare(entry.item.pk, startAfter.pk) ||
  compare(entry.item.sk, startAfter.sk);

const assertCondition = (
  items: ReadonlyMap<string, EncodedItem>,
  request: ConditionalPut,
): void => {
  const current = items.get(target(request.item));
  if (request.condition?.kind === 'not-exists' && current !== undefined)
    throw new ConditionFailure();
  if (
    request.condition?.kind === 'updated' &&
    current?.meta._u !== request.condition.value
  )
    throw new ConditionFailure();
};

const writeFailure = (cause: unknown) =>
  cause instanceof ConditionFailure ? cause : new OperationFailure({ cause });

export const makeTableContract = (
  table: MemoryTable,
  items: Map<string, EncodedItem>,
): StdTableContract => ({
  getItem: (key) =>
    Effect.try({
      try: () => {
        const item = items.get(target(key));
        return item === undefined ? null : cloneItem(item);
      },
      catch: (cause) => new OperationFailure({ cause }),
    }),
  writeItem: (request) =>
    Effect.try({
      try: () => {
        assertCondition(items, request);
        items.set(target(request.item), cloneItem(request.item));
      },
      catch: writeFailure,
    }),
  transactWriteItems: (requests) =>
    Effect.try({
      try: () => {
        const pending = new Map(items);
        for (const request of requests) {
          assertCondition(pending, request);
          pending.set(target(request.item), cloneItem(request.item));
        }
        items.clear();
        for (const [key, item] of pending) items.set(key, item);
      },
      catch: writeFailure,
    }),
  hardDeleteItem: (key) =>
    Effect.try({
      try: () => void items.delete(target(key)),
      catch: (cause) => new OperationFailure({ cause }),
    }),
  hardDeleteEntityItems: (entity) =>
    Effect.try({
      try: () => {
        let removed = 0;
        for (const [key, item] of items) {
          if (item.meta._e !== entity) continue;
          items.delete(key);
          removed++;
        }
        return removed;
      },
      catch: (cause) => new OperationFailure({ cause }),
    }),
  hardDeleteAllItems: () =>
    Effect.try({
      try: () => {
        const removed = items.size;
        items.clear();
        return removed;
      },
      catch: (cause) => new OperationFailure({ cause }),
    }),
  queryItems: (request) =>
    Effect.try({
      try: () => {
        const direction = request.descending ? -1 : 1;
        const matching = [...items.values()]
          .flatMap((item) => {
            const ordered = orderedItem(table, item, request.index);
            return ordered === undefined ? [] : [ordered];
          })
          .filter(
            (entry) =>
              entry.partitionKey === request.pk &&
              matchesSort(entry.sortKey, request.sort) &&
              (request.startAfter === undefined ||
                comparePosition(entry, request.startAfter) * direction > 0),
          )
          .sort((left, right) => compareOrdered(left, right) * direction);
        const selected = matching.slice(0, request.limit + 1);
        return {
          items: selected
            .slice(0, request.limit)
            .map(({ item }) => cloneItem(item)),
          hasMore: selected.length > request.limit,
        };
      },
      catch: (cause) => new OperationFailure({ cause }),
    }),
});
