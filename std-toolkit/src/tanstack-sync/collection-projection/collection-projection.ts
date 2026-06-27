import type { SyncConfig } from '@tanstack/react-db';
import type { EntityType } from '../../core/index.js';
import type { Accepted } from '../source-of-truth/index.js';
import type { CollectionItem } from '../types.js';

/**
 * The mount-time callbacks TanStack hands a collection's `sync` function: the
 * transaction primitives (`begin`/`write`/`commit`) plus readiness/truncate. This
 * is the parameter object of `SyncConfig['sync']`, not a separately exported name.
 */
type SyncCallbacks<T extends object> = Parameters<
  SyncConfig<T, string>['sync']
>[0];

/**
 * The TanStack write side of a mounted collection. Constructed per-mount with
 * callbacks in hand; the instance's existence is the mounted state.
 */
type Projector<TItem> = {
  project: (accepted: Accepted<TItem>) => void;
  projectEntities: (entities: EntityType<TItem>[]) => void;
  projectAll: (entities: EntityType<TItem>[]) => void;
};

type ProjectorOptions<TItem> = {
  deleteKeyOf?: (entity: EntityType<TItem>) => string | null;
};

/**
 * Builds the per-mount projector that turns accepted deltas into TanStack
 * insert/update/delete writes, and backfills the collection from retained SoT on
 * mount. Translation hoists an entity's `value` fields to the top level and nests
 * its meta under `_meta`. The collection derives live row keys via its own `getKey`;
 * tombstone deletes carry keys from `deleteKeyOf`.
 */
export const makeCollectionProjector = <TItem>(
  callbacks: SyncCallbacks<CollectionItem<TItem>>,
  options: ProjectorOptions<TItem> = {},
): Projector<TItem> => {
  const toItem = (entity: EntityType<TItem>): CollectionItem<TItem> =>
    ({
      ...(entity.value as object),
      _meta: entity.meta,
    }) as CollectionItem<TItem>;

  const insertEntities = (entities: EntityType<TItem>[]): void => {
    if (entities.length === 0) return;
    callbacks.begin();
    for (const entity of entities) {
      callbacks.write({ type: 'insert', value: toItem(entity) });
    }
    callbacks.commit();
  };

  const project = (accepted: Accepted<TItem>): void => {
    if (accepted.upserts.length === 0 && accepted.tombstoned.length === 0) {
      return;
    }
    callbacks.begin();
    for (const entity of accepted.upserts) {
      callbacks.write({ type: 'update', value: toItem(entity) });
    }
    for (const key of accepted.tombstoned) {
      callbacks.write({ type: 'delete', key });
    }
    callbacks.commit();
  };

  return {
    project,
    projectEntities: (entities) => {
      const upserts: EntityType<TItem>[] = [];
      const tombstoned: string[] = [];
      for (const entity of entities) {
        if (entity.meta._d) {
          const key = options.deleteKeyOf?.(entity) ?? null;
          if (key != null) tombstoned.push(key);
        } else {
          upserts.push(entity);
        }
      }
      project({ upserts, tombstoned });
    },
    projectAll: insertEntities,
  };
};
