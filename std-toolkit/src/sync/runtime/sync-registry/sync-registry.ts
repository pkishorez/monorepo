import { Effect } from 'effect';
import type { EntityType } from '../../../core/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type { EffectRunner } from '../effect-runner/index.js';
import { isEntity } from '../../domain/entity-validation/index.js';
import type { SyncReporter } from '../../domain/sync-event/index.js';
import type { CollectionFlow } from '../sync-flow/index.js';

export type CollectionHandle = {
  schemaName: string;
  collectionName: string;
  applyToSyncReplica: (
    entities: EntityType<unknown>[],
  ) => Effect.Effect<void, WriteError>;
  projectOnly: (
    entities: EntityType<unknown>[],
  ) => Effect.Effect<void, WriteError>;
  flow: () => CollectionFlow | null;
};

export type Tracker = {
  register: (handle: CollectionHandle) => void;
  lookup: (schemaName: string) => CollectionHandle | null;
};

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

/**
 * Builds the Registry Broadcast router over a tracker. `process` validates the
 * message shape (explicit `persist`), groups incoming entities by `meta._e`,
 * looks up the owning Collection, and routes each group to
 * `applyToSyncReplica` (persist) or `projectOnly` (preview). Entities whose
 * `_e` no Collection owns are silently ignored. Registry Broadcast delivery
 * never touches Sync State.
 */
export const buildRegistry = <R>(
  tracker: Tracker,
  runner: EffectRunner<R>,
  report: SyncReporter<R>,
) => ({
  process: (message: unknown): void => {
    if (
      !message ||
      typeof message !== 'object' ||
      !('values' in message) ||
      !Array.isArray(message.values) ||
      !('persist' in message) ||
      typeof message.persist !== 'boolean' ||
      !message.values.every(isEntity)
    ) {
      throw new Error(
        '[sync] registry.process requires { values: Entity[]; persist: boolean }.',
      );
    }

    const { values, persist } = message as {
      values: EntityType<unknown>[];
      persist: boolean;
    };
    const groups = new Map<string, EntityType<unknown>[]>();
    for (const entity of values) {
      const type = entity.meta._e;
      const group = groups.get(type) ?? [];
      group.push(entity);
      groups.set(type, group);
    }

    for (const [type, entities] of groups) {
      const handle = tracker.lookup(type);
      if (!handle) continue;
      const route = persist ? handle.applyToSyncReplica : handle.projectOnly;
      const flow = handle.flow();
      const delivery = route(entities);
      void runner
        .runPromise(
          (flow
            ? delivery.pipe(
                flow.collection.withSpan('Registry Broadcast Delivery', {
                  attributes: {
                    collection: handle.collectionName,
                    entityCount: entities.length,
                    persist,
                  },
                }),
              )
            : delivery
          ).pipe(
            Effect.catch((cause) =>
              report({
                _tag: 'RegistryDeliveryFailed',
                collection: handle.collectionName,
                cause,
              }),
            ),
            Effect.catchCause((cause) =>
              Effect.logError(
                '[sync] Registry Broadcast delivery defect',
                cause,
              ),
            ),
          ),
        )
        .catch(() => undefined);
    }
  },
});
