import type { SyncConfig } from '@tanstack/react-db';
import type { DecodedEntity } from '../../../core/index.js';
import type { CollectionItem } from '../../domain/collection-item/index.js';

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
  projectEntities: (entities: DecodedEntity<TItem>[]) => void;
};

type ProjectorOptions<TItem> = {
  deleteKeyOf?: (entity: DecodedEntity<TItem>) => string | null;
};

/**
 * Builds the per-mount projector that turns accepted deltas into TanStack
 * update/delete writes. Translation hoists an entity's `value` fields to the top
 * level and nests its meta under `_meta`. The collection derives live row keys via
 * its own `getKey`; tombstone deletes carry keys from `deleteKeyOf`.
 */
export const makeCollectionProjector = <TItem>(
  callbacks: SyncCallbacks<CollectionItem<TItem>>,
  options: ProjectorOptions<TItem> = {},
): Projector<TItem> => {
  const toItem = (entity: DecodedEntity<TItem>): CollectionItem<TItem> =>
    ({
      ...(entity.value as object),
      _meta: entity.meta,
    }) as CollectionItem<TItem>;

  const projectEntities = (entities: DecodedEntity<TItem>[]): void => {
    if (entities.length === 0) return;
    callbacks.begin();
    for (const entity of entities) {
      if (entity.meta._d) {
        const key = options.deleteKeyOf?.(entity) ?? null;
        if (key != null) callbacks.write({ type: 'delete', key });
      } else {
        callbacks.write({ type: 'update', value: toItem(entity) });
      }
    }
    callbacks.commit();
  };

  return {
    projectEntities,
  };
};
