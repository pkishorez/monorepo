import { Effect, Layer } from 'effect';
import {
  ConditionFailure,
  OperationFailure,
  contractLayer,
  type QueryRequest,
  type ConditionalPut,
  type EncodedKey,
  type EncodedItem,
  type StdTableContract,
  type StdTableService,
} from '../contract/index.js';

const target = ({ pk, sk }: EncodedKey): string => `${pk}\0${sk}`;

const matchesSort = (sortKey: string, sort: QueryRequest['sort']): boolean => {
  if (sort === undefined) return true;
  if (sort.operator === 'between') {
    return sortKey >= sort.value[0] && sortKey <= sort.value[1];
  }
  if (sort.operator === 'beginsWith') return sortKey.startsWith(sort.value);
  if (sort.operator === '=') return sortKey === sort.value;
  if (sort.operator === '<') return sortKey < sort.value;
  if (sort.operator === '<=') return sortKey <= sort.value;
  if (sort.operator === '>') return sortKey > sort.value;
  return sortKey >= sort.value;
};

const assertCondition = (
  items: ReadonlyMap<string, EncodedItem>,
  request: ConditionalPut,
): void => {
  const current = items.get(target(request.item));
  if (request.condition?.kind === 'not-exists' && current !== undefined) {
    throw new ConditionFailure();
  }
  if (
    request.condition?.kind === 'updated' &&
    current?.meta._u !== request.condition.value
  ) {
    throw new ConditionFailure();
  }
};

interface TopologySource {
  readonly localSecondaryIndexes: Readonly<
    Record<string, { readonly sk: string }>
  >;
  readonly globalSecondaryIndexes: Readonly<
    Record<string, { readonly pk: string; readonly sk: string }>
  >;
}

export interface DeterministicRuntime<Name extends string> {
  readonly contract: StdTableContract;
  readonly layer: Layer.Layer<StdTableService<Name>>;
  readonly items: ReadonlyMap<string, EncodedItem>;
}

const indexKey = (
  item: EncodedItem,
  slot: string,
  topology: TopologySource | undefined,
): EncodedKey | undefined => {
  const lsi = topology?.localSecondaryIndexes[slot];
  if (lsi !== undefined) {
    const sk = item.keys[lsi.sk];
    return sk === undefined ? undefined : { pk: item.pk, sk };
  }
  const gsi = topology?.globalSecondaryIndexes[slot];
  if (gsi !== undefined) {
    const pk = item.keys[gsi.pk];
    const sk = item.keys[gsi.sk];
    return pk === undefined || sk === undefined ? undefined : { pk, sk };
  }
  return undefined;
};

export const makeDeterministicContract = <Name extends string>(
  logicalName: Name,
  topology?: TopologySource,
  pageSize = 2,
): DeterministicRuntime<Name> => {
  const items = new Map<string, EncodedItem>();

  const contract: StdTableContract = {
    getItem: (key) => Effect.sync(() => items.get(target(key)) ?? null),
    writeItem: (request) =>
      Effect.try({
        try: () => {
          assertCondition(items, request);
          items.set(target(request.item), request.item);
        },
        catch: (cause) =>
          cause instanceof ConditionFailure
            ? cause
            : new OperationFailure({ cause }),
      }),
    transactWriteItems: (requests) =>
      Effect.try({
        try: () => {
          const pending = new Map(items);
          for (const request of requests) {
            assertCondition(pending, request);
            pending.set(target(request.item), request.item);
          }
          items.clear();
          for (const [key, item] of pending) items.set(key, item);
        },
        catch: (cause) =>
          cause instanceof ConditionFailure
            ? cause
            : new OperationFailure({ cause }),
      }),
    hardDeleteItem: (key) => Effect.sync(() => void items.delete(target(key))),
    hardDeleteEntityItems: (entity) =>
      Effect.sync(() => {
        let removed = 0;
        for (const [key, item] of items) {
          if (item.meta._e !== entity) continue;
          items.delete(key);
          removed++;
        }
        return removed;
      }),
    hardDeleteAllItems: () =>
      Effect.sync(() => {
        const removed = items.size;
        items.clear();
        return removed;
      }),
    queryItems: (request) =>
      Effect.sync(() => {
        const matching = [...items.values()]
          .map((item) => ({
            item,
            key:
              request.index === undefined
                ? item
                : indexKey(item, request.index, topology),
          }))
          .filter(
            (entry): entry is { item: EncodedItem; key: EncodedKey } =>
              entry.key !== undefined &&
              entry.key.pk === request.pk &&
              matchesSort(entry.key.sk, request.sort),
          )
          .sort(
            (left, right) =>
              left.key.sk.localeCompare(right.key.sk) ||
              left.item.pk.localeCompare(right.item.pk) ||
              left.item.sk.localeCompare(right.item.sk),
          );
        if (request.descending) matching.reverse();
        const startAfter = request.startAfter;
        const offset =
          startAfter === undefined
            ? 0
            : matching.findIndex(
                ({ item }) =>
                  item.pk === startAfter.pk && item.sk === startAfter.sk,
              ) + 1;
        const end = Math.min(
          offset + Math.min(pageSize, request.limit),
          matching.length,
        );
        return {
          items: matching.slice(offset, end).map(({ item }) => item),
          hasMore: end < matching.length,
        };
      }),
  };

  return {
    contract,
    layer: contractLayer(logicalName, contract),
    items,
  };
};
