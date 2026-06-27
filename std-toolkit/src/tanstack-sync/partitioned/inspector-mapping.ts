import type { EntityType } from '../../core/index.js';
import type {
  InspectorPartition,
  InspectorStrategyState,
  WritableSyncInspector,
} from '../inspector/index.js';
import { GLOBAL_PARTITION_KEY } from './constants.js';

type RawSlice = { low: unknown; high: unknown; itemCount: number };

const cursorU = (cursor: unknown): string | null => {
  if (cursor == null || typeof cursor !== 'object') return null;
  const meta = (cursor as { meta?: unknown }).meta;
  if (meta == null || typeof meta !== 'object') return null;
  const u = (meta as { _u?: unknown })._u;
  return typeof u === 'string' ? u : null;
};

const countInRange = (
  entities: ReadonlyArray<EntityType<unknown>>,
  low: unknown,
  high: unknown,
  partitionField: string,
  partitionValue: string,
): number => {
  const lo = cursorU(low);
  const hi = cursorU(high);
  if (lo == null || hi == null) return 0;
  let count = 0;
  for (const entity of entities) {
    if (partitionField !== '') {
      const fieldValue = (entity.value as Record<string, unknown>)[
        partitionField
      ];
      if (String(fieldValue) !== partitionValue) continue;
    }
    const u = entity.meta._u;
    if (u >= lo && u <= hi) count += 1;
  }
  return count;
};

const countByField = (
  entities: ReadonlyArray<EntityType<unknown>>,
  partitionField: string,
  partitionValue: string,
): number => {
  if (partitionField === '') return entities.length;
  let count = 0;
  for (const entity of entities) {
    const fieldValue = (entity.value as Record<string, unknown>)[
      partitionField
    ];
    if (String(fieldValue) === partitionValue) count += 1;
  }
  return count;
};

export const countNewToOldSlices = (
  value: unknown,
  entities: ReadonlyArray<EntityType<unknown>>,
  partitionField: string,
  partitionValue: string,
): { value: unknown; itemCount: number } => {
  // Cursor-based (`oldToNew`) state has no slices: its membership is the set of
  // entities matching the partition field, not a windowed range.
  if (value == null || typeof value !== 'object' || !('slices' in value)) {
    return {
      value,
      itemCount: countByField(entities, partitionField, partitionValue),
    };
  }
  const slices = (value as { slices?: unknown }).slices;
  if (!Array.isArray(slices)) return { value, itemCount: 0 };

  let itemCount = 0;
  const countedSlices = (slices as RawSlice[]).map((slice) => {
    const sliceItemCount = countInRange(
      entities,
      slice.low,
      slice.high,
      partitionField,
      partitionValue,
    );
    itemCount += sliceItemCount;
    return { ...slice, itemCount: sliceItemCount };
  });

  return {
    value: { ...(value as object), slices: countedSlices },
    itemCount,
  };
};

export const describeStrategyState = (
  strategyName: string,
  value: unknown,
): InspectorStrategyState => {
  const readSlices = (): {
    low: unknown;
    high: unknown;
    itemCount: number;
  }[] => {
    const rawSlices =
      value != null &&
      typeof value === 'object' &&
      Array.isArray((value as { slices?: unknown }).slices)
        ? (value as { slices: RawSlice[] }).slices
        : [];
    return rawSlices.map((slice) => ({
      low: slice.low,
      high: slice.high,
      itemCount: slice.itemCount,
    }));
  };

  if (strategyName === 'bidirectional') {
    return { strategy: 'bidirectional', slices: readSlices() };
  }

  if (strategyName === 'new-to-old') {
    const reachedOldest =
      value != null && typeof value === 'object'
        ? Boolean((value as { reachedOldest?: unknown }).reachedOldest)
        : false;
    return { strategy: 'newToOld', slices: readSlices(), reachedOldest };
  }

  const cursor =
    value != null && typeof value === 'object'
      ? ((value as { cursor?: unknown }).cursor ?? null)
      : null;
  return { strategy: 'oldToNew', cursor };
};

const STATE_GROUP_PREFIX = 'state/';

type StoredStrategyState = {
  strategy: string;
  value: unknown;
  meta: {
    collectionName: string;
    partitionField: string;
    partitionValue: string;
    partitionKey: string;
    itemCount: number;
  };
};

const isStoredStrategyState = (
  value: unknown,
): value is StoredStrategyState => {
  if (value == null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.strategy !== 'string' || !('value' in candidate)) {
    return false;
  }
  const meta = candidate.meta as Record<string, unknown> | undefined;
  return (
    meta != null &&
    typeof meta.collectionName === 'string' &&
    typeof meta.partitionField === 'string' &&
    typeof meta.partitionValue === 'string' &&
    typeof meta.partitionKey === 'string' &&
    typeof meta.itemCount === 'number'
  );
};

export const restoreCachedPartitions = (
  inspector: WritableSyncInspector,
  groups: ReadonlyArray<{
    group: string;
    entries: ReadonlyArray<{ key: string; value: unknown }>;
  }>,
): void => {
  for (const { group, entries } of groups) {
    if (!group.startsWith(STATE_GROUP_PREFIX)) continue;
    for (const { key, value } of entries) {
      if (!isStoredStrategyState(value)) continue;
      const { meta } = value;
      const id = `${meta.collectionName}:${key}`;
      if (inspector.partitions.has(id)) continue;
      const row: InspectorPartition = {
        id,
        collectionName: meta.collectionName,
        partitionField: meta.partitionField,
        partitionValue: meta.partitionValue,
        partitionKey: meta.partitionKey,
        partitionKind: key === GLOBAL_PARTITION_KEY ? 'global' : 'partition',
        activity: 'cached',
        itemCount: meta.itemCount,
        subscriberCount: 0,
        strategyState: describeStrategyState(value.strategy, value.value),
      };
      inspector.upsertPartition(row);
    }
  }
};
