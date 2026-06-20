import { Effect } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type { AnyEntityESchema } from '@std-toolkit/eschema';
import { converge } from './convergence.js';
import type { WriteError } from './write-error.js';

/**
 * The delta produced by a successful Source-of-Truth write: entities that landed
 * as live upserts, and ids whose accepted entity is a tombstone.
 */
export type Accepted<TItem> = {
  upserts: EntityType<TItem>[];
  tombstoned: string[];
};

/**
 * Server-confirmed entity store for a single collection. Engine-owned, live while
 * unmounted, retains tombstones. All methods return `Effect` so an IndexedDB swap
 * stays signature-stable; bodies close over an in-memory `Map`.
 */
export type SourceOfTruth<TItem> = {
  write: (
    entities: EntityType<TItem>[],
  ) => Effect.Effect<Accepted<TItem>, WriteError>;
  getAll: () => Effect.Effect<EntityType<TItem>[]>;
  get: (id: string) => Effect.Effect<EntityType<TItem> | null>;
};

const isStructurallySound = (
  entity: unknown,
): entity is EntityType<unknown> => {
  if (entity == null || typeof entity !== 'object') return false;
  const candidate = entity as { value?: unknown; meta?: unknown };
  if (!('value' in candidate) || candidate.value == null) return false;
  const meta = candidate.meta as Record<string, unknown> | undefined;
  if (meta == null || typeof meta !== 'object') return false;
  return (
    typeof meta._e === 'string' &&
    typeof meta._u === 'string' &&
    typeof meta._v === 'string' &&
    typeof meta._d === 'boolean'
  );
};

/**
 * Builds an in-memory Source of Truth keyed by the schema's id field. `write`
 * validates the whole batch atomically (any failure → nothing written), then
 * converges each entity, retaining accepted tombstones in the map.
 */
export const makeSourceOfTruth = <TItem>(
  schema: AnyEntityESchema,
): SourceOfTruth<TItem> => {
  const store = new Map<string, EntityType<TItem>>();
  const idField = schema.idField;

  const idOf = (entity: EntityType<TItem>): string | null => {
    const value = entity.value as Record<string, unknown>;
    const id = value[idField];
    return typeof id === 'string' ? id : null;
  };

  return {
    write: (entities) =>
      Effect.gen(function* () {
        for (const entity of entities) {
          if (!isStructurallySound(entity)) {
            return yield* Effect.fail<WriteError>({
              _tag: 'Invalid',
              reason: 'entity is missing value or a well-formed meta',
            });
          }
          if (entity.meta._e !== schema.name) {
            return yield* Effect.fail<WriteError>({
              _tag: 'WrongEntity',
              expected: schema.name,
              received: entity.meta._e,
            });
          }
          if (idOf(entity) == null) {
            return yield* Effect.fail<WriteError>({
              _tag: 'MissingId',
              entity,
            });
          }
        }

        const upserts: EntityType<TItem>[] = [];
        const tombstoned: string[] = [];

        for (const incoming of entities) {
          const id = idOf(incoming)!;
          const current = store.get(id) ?? null;
          if (converge(current, incoming) === 'skip') continue;
          store.set(id, incoming);
          if (incoming.meta._d) tombstoned.push(id);
          else upserts.push(incoming);
        }

        return { upserts, tombstoned };
      }),
    getAll: () =>
      Effect.sync(() =>
        Array.from(store.values()).filter((entity) => !entity.meta._d),
      ),
    get: (id) => Effect.sync(() => store.get(id) ?? null),
  };
};
