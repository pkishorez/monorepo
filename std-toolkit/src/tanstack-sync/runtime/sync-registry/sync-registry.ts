import { Effect } from 'effect';
import type { EntityType } from '../../../core/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type { EffectRunner } from '../effect-runner/index.js';
import { isEntity } from '../../domain/entity-validation/index.js';
import type { SyncReporter } from '../../domain/sync-event/index.js';

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
 * Builds the broadcast router over a tracker. `process` validates the message
 * shape (explicit `persist`), groups incoming entities by `meta._e`, looks up the
 * owning collection handle, and routes each group to `writeServerTruth` (persist)
 * or `projectOnly` (preview). Entities whose `_e` no collection owns are silently
 * ignored. The registry never touches strategy sync-state.
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
        '[std-sync] registry.process requires { values: Entity[]; persist: boolean }.',
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
      const route = persist ? handle.writeServerTruth : handle.projectOnly;
      void runner.runPromise(
        route(entities).pipe(
          Effect.catch((cause) =>
            report({
              _tag: 'RegistryWriteFailed',
              collection: type,
              cause,
            }),
          ),
        ),
      );
    }
  },
});
