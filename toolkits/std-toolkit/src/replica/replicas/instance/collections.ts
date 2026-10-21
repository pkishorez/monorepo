import {
  createCollection,
  type Collection,
  type SyncConfig,
} from '@tanstack/db';
import { Effect, Result, Schema } from 'effect';
import type { EntityMeta } from '../../../core/index.js';
import {
  findOutdatedVersion,
  type AnyEntityESchema,
} from '../../../eschema/index.js';
import type { AnyShape } from '../../shape/index.js';
import type { Wire } from '../../store/contract/index.js';
import { windowsOf, type WindowAt } from './windows.js';

/*
 * The TanStack DB Collections of one Instance. They show what the Store
 * holds: each Entity decoded through its ESchema's `entity` schema to its
 * latest value, its meta under `_meta`. A tombstone takes its row away.
 * Optimistic Changes sit on top of them, as TanStack DB keeps them.
 *
 * A Collection with Windows loads on demand: each Query's `where` says
 * which Windows it opens, and its end lets them go. Every row the Store
 * holds is shown already, so a Query reads at once and waits for no fetch.
 */

/** An Entity read through its ESchema: kept, newer than this app knows, or not one of them at all. */
export type Read =
  | {
      readonly _tag: 'Read';
      readonly id: string;
      readonly entity: Wire;
      readonly value: object;
      readonly meta: EntityMeta;
    }
  | { readonly _tag: 'Outdated'; readonly version: string }
  | { readonly _tag: 'Invalid'; readonly message: string };

/** Reads Entities of one ESchema, in encoded form. */
export const reader = (schema: AnyEntityESchema) => {
  const decode = Schema.decodeUnknownResult(schema.entity);
  return (entity: Wire): Read => {
    const decoded = decode(entity);
    if (Result.isSuccess(decoded)) {
      const { value, meta } = decoded.success as {
        readonly value: Record<string, unknown>;
        readonly meta: EntityMeta;
      };
      return {
        _tag: 'Read',
        id: String(value[schema.idField]),
        entity,
        value,
        meta,
      };
    }
    const outdated = findOutdatedVersion(decoded.failure);
    return outdated
      ? { _tag: 'Outdated', version: entity.meta._v }
      : { _tag: 'Invalid', message: decoded.failure.message };
  };
};

type Sync = Parameters<SyncConfig<object, string>['sync']>[0];

let made = 0;

/** A Collection's Windows: the fields it opens them on, and who hears a Query open and let go of one. */
export interface Windowed {
  readonly paths: ReadonlyArray<string>;
  readonly open: (window: WindowAt) => void;
  readonly release: (window: WindowAt) => void;
}

/** The Collections of an Instance, and how what the Store holds reaches them. */
export const showCollections = (
  shape: AnyShape,
  name: string,
  windowed: Readonly<Record<string, Windowed>>,
) => {
  const syncs = new Map<string, Sync>();
  const shown = new Map<string, Set<string>>();
  const collections: Record<string, Collection<object, string>> = {};
  for (const [collection, schema] of Object.entries(shape.collections)) {
    shown.set(collection, new Set());
    const windows = windowed[collection];
    collections[collection] = createCollection<object, string>({
      id: `${name}/${collection}#${++made}`,
      getKey: (row) => String((row as Record<string, unknown>)[schema.idField]),
      // Its rows live as long as the Instance, never collected under it.
      gcTime: 0,
      startSync: true,
      ...(windows && { syncMode: 'on-demand' as const }),
      sync: {
        sync: (sync) => {
          syncs.set(collection, sync);
          sync.markReady();
          if (!windows) return;
          return {
            loadSubset: (options) => {
              for (const window of windowsOf(options, windows.paths))
                windows.open(window);
              return true;
            },
            unloadSubset: (options) => {
              for (const window of windowsOf(options, windows.paths))
                windows.release(window);
            },
          };
        },
      },
    });
  }

  /** Shows what was read from the Store; a tombstone takes its row away. */
  const show = (collection: string, read: ReadonlyArray<Read>) => {
    const sync = syncs.get(collection);
    const rows = shown.get(collection);
    if (!sync || !rows) return;
    sync.begin();
    for (const each of read) {
      if (each._tag !== 'Read') continue;
      if (each.meta._d) {
        if (rows.delete(each.id)) sync.write({ type: 'delete', key: each.id });
        continue;
      }
      sync.write({
        type: rows.has(each.id) ? 'update' : 'insert',
        value: { ...each.value, _meta: each.meta },
      });
      rows.add(each.id);
    }
    sync.commit();
  };

  const cleanup = Effect.promise(() =>
    Promise.all(Object.values(collections).map((each) => each.cleanup())),
  ).pipe(Effect.asVoid);

  return { collections, show, cleanup };
};
