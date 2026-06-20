import type { Effect } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type { WriteError } from '../source-of-truth/index.js';

/**
 * Internal handle a collection registers with the tracker so the registry can
 * route broadcast traffic to it. Never exported from the package barrel.
 */
export type CollectionHandle = {
  schemaName: string;
  writeServerTruth: (
    entities: EntityType<unknown>[],
  ) => Effect.Effect<void, WriteError>;
  projectOnly: (
    entities: EntityType<unknown>[],
  ) => Effect.Effect<void, WriteError>;
};

export type Tracker = {
  register: (handle: CollectionHandle) => void;
  lookup: (schemaName: string) => CollectionHandle | null;
};

/**
 * Builds a tracker mapping schema name → collection handle. Registration throws
 * on a duplicate schema name, enforcing disjoint per-collection ownership.
 */
export const makeTracker = (): Tracker => {
  const handles = new Map<string, CollectionHandle>();
  return {
    register: (handle) => {
      if (handles.has(handle.schemaName)) {
        throw new Error(
          `A collection for schema "${handle.schemaName}" is already registered.`,
        );
      }
      handles.set(handle.schemaName, handle);
    },
    lookup: (schemaName) => handles.get(schemaName) ?? null,
  };
};
