import { Clock, Effect, Latch } from 'effect';
import type { EntityType } from '../../core/index.js';
import type { CollectionItem } from '../types.js';
import type { WriteError } from '../source-of-truth/write-error.js';

export type CadenceConfig = {
  window: number;
  readiness: number;
  pollDelay: number;
  // When set, the repair loop emits structured `[tanstack-sync:cadence]` logs
  // for each scan/wait/fetch/write step. Off by default to keep the loop quiet.
  debug?: boolean;
};

// The repair loop reads the collection's in-memory rows synchronously; TanStack
// DB exposes no synchronous query method, only iteration over the current state.
export type SyncCollection<T> = {
  subscriberCount: number;
  on(
    event: 'subscribers:change',
    cb: (args: {
      previousSubscriberCount: number;
      subscriberCount: number;
    }) => void,
  ): () => void;
  values(): IterableIterator<CollectionItem<T>>;
};

type Meta<T> = EntityType<T>['meta'];

const metaOf = <T>(row: CollectionItem<T>): Meta<T> | undefined =>
  (row as { _meta?: Meta<T> })._meta;

// Reconstruct the `{ value, meta }` entity shape from a flat collection row so
// the anchor handed to `forwardFetch` carries `meta._u`. Only `meta` is read
// downstream, but value is preserved (minus `_meta` and runtime virtual props).
const toEntity = <T>(row: CollectionItem<T>): EntityType<T> => {
  const {
    _meta,
    $synced: _synced,
    $origin: _origin,
    ...value
  } = row as Record<string, unknown> &
    Partial<{ _meta: Meta<T>; $synced: unknown; $origin: unknown }>;
  return { value, meta: _meta } as unknown as EntityType<T>;
};

export type CadenceSyncDeps<T, E> = {
  collection: SyncCollection<T>;
  fetchFrom: (
    anchor: EntityType<T> | null,
  ) => Effect.Effect<EntityType<T>[], E>;
  writeServerTruth: (
    entities: EntityType<T>[],
  ) => Effect.Effect<void, WriteError>;
  // Restricts the repair scope to a single partition: only rows whose flat
  // `field` equals `value` are considered. Omitted for unpartitioned collections.
  partition?: { field: string; value: string } | undefined;
  config: CadenceConfig;
};

const isSuspect = <T>(meta: EntityType<T>['meta'], window: number): boolean => {
  if (meta._s == null) return false;
  return meta._s - Date.parse(meta._u) < window;
};

const msUntilReady = <T>(
  meta: EntityType<T>['meta'],
  nowMs: number,
  readiness: number,
): number => {
  const skew = meta._c != null && meta._s != null ? meta._c - meta._s : 0;
  const elapsed = nowMs - skew - Date.parse(meta._u);
  return Math.max(0, readiness - elapsed);
};

type Partition = { field: string; value: string };

const inPartition = (
  row: Record<string, unknown>,
  partition: Partition | undefined,
): boolean =>
  partition == null || String(row[partition.field]) === partition.value;

type SuspectScan<T> = {
  oldest: EntityType<T> | undefined;
  suspectCount: number;
  scanned: number;
};

// Single pass over the partition's rows: count suspects and keep the one with
// the oldest `_u` (the most likely to be ready for repair).
const scanSuspects = <T>(
  collection: SyncCollection<T>,
  window: number,
  partition: Partition | undefined,
): SuspectScan<T> => {
  let scanned = 0;
  let suspectCount = 0;
  let oldestRow: CollectionItem<T> | undefined;
  let oldestU = '';
  for (const row of collection.values()) {
    const meta = metaOf(row);
    if (meta == null || !inPartition(row as Record<string, unknown>, partition))
      continue;
    scanned += 1;
    if (!isSuspect<T>(meta, window)) continue;
    suspectCount += 1;
    if (oldestRow === undefined || meta._u < oldestU) {
      oldestRow = row;
      oldestU = meta._u;
    }
  }
  return {
    oldest: oldestRow ? toEntity(oldestRow) : undefined,
    suspectCount,
    scanned,
  };
};

// Newest row whose `_u` precedes the suspect: the repair re-fetches inclusively
// from this anchor so siblings that landed at the suspect's `_u` are picked up.
const queryPredecessor = <T>(
  collection: SyncCollection<T>,
  suspect: EntityType<T>,
  partition: Partition | undefined,
): EntityType<T> | undefined => {
  const suspectU = suspect.meta._u;
  let bestRow: CollectionItem<T> | undefined;
  let bestU = '';
  for (const row of collection.values()) {
    const meta = metaOf(row);
    if (meta == null || !inPartition(row as Record<string, unknown>, partition))
      continue;
    if (!(meta._u < suspectU)) continue;
    if (bestRow === undefined || meta._u > bestU) {
      bestRow = row;
      bestU = meta._u;
    }
  }
  return bestRow ? toEntity(bestRow) : undefined;
};

export const runCadenceSync = <T, E>(
  deps: CadenceSyncDeps<T, E>,
): Effect.Effect<void, WriteError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const { collection, fetchFrom, writeServerTruth, partition, config } =
        deps;

      const dbg = (event: string, data: Record<string, unknown>) =>
        config.debug
          ? Effect.sync(() =>
              console.debug('[tanstack-sync:cadence]', event, {
                partition: partition?.value,
                ...data,
              }),
            )
          : Effect.void;

      const latch = yield* Latch.make(collection.subscriberCount > 0);

      yield* dbg('start', {
        subscriberCount: collection.subscriberCount,
        window: config.window,
        readiness: config.readiness,
      });

      const offSubscribersChange = collection.on(
        'subscribers:change',
        ({ subscriberCount }) => {
          if (subscriberCount > 0) {
            latch.openUnsafe();
          } else {
            latch.closeUnsafe();
          }
        },
      );

      yield* Effect.addFinalizer(() => Effect.sync(offSubscribersChange));

      const loop: Effect.Effect<void, WriteError> = Effect.gen(function* () {
        yield* latch.await;

        const {
          oldest: suspect,
          suspectCount,
          scanned,
        } = scanSuspects(collection, config.window, partition);

        if (!suspect) {
          yield* dbg('idle', { scanned, suspectCount: 0 });
          yield* Effect.sleep(config.pollDelay);
          return yield* loop;
        }

        const nowMs = yield* Clock.currentTimeMillis;

        const waitMs = msUntilReady(suspect.meta, nowMs, config.readiness);
        if (waitMs > 0) {
          yield* dbg('wait', {
            scanned,
            suspectCount,
            u: suspect.meta._u,
            waitMs,
          });
          yield* Effect.sleep(waitMs);
          return yield* loop;
        }

        const predecessor = queryPredecessor(collection, suspect, partition);
        const anchor = predecessor ?? null;
        yield* dbg('repair:fetch', {
          scanned,
          suspectCount,
          suspectU: suspect.meta._u,
          anchorU: anchor?.meta._u ?? null,
        });
        const results = yield* fetchFrom(anchor).pipe(
          Effect.mapError(
            (e) => ({ _tag: 'Invalid', reason: String(e) }) as WriteError,
          ),
        );
        yield* writeServerTruth(results);
        yield* dbg('repair:wrote', { fetched: results.length });

        return yield* loop;
      });

      yield* loop;
    }),
  );
