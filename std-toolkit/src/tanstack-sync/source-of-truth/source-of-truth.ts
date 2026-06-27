import { Clock, Effect, Schema } from 'effect';
import { MetaSchema } from '../../core/index.js';
import type { EntityType } from '../../core/index.js';
import type { AnyEntityESchema } from '../../eschema/index.js';
import type { OfflineStorageGroup } from '../offline-storage/index.js';
import { converge } from './convergence.js';
import { storageError } from './write-error.js';
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
  getAll: () => Effect.Effect<EntityType<TItem>[], WriteError>;
  get: (id: string) => Effect.Effect<EntityType<TItem> | null, WriteError>;
};

const isMeta = Schema.is(MetaSchema);

/**
 * Structural guard on the entity wire shape: a present `value` plus a well-formed
 * meta block. It reuses core's `MetaSchema` for the meta check and deliberately
 * does not validate the value's domain fields — SoT stores server truth verbatim
 * and converges by `_u`.
 */
const isStructurallySound = (
  entity: unknown,
): entity is EntityType<unknown> => {
  if (entity == null || typeof entity !== 'object') return false;
  const candidate = entity as { value?: unknown; meta?: unknown };
  if (!('value' in candidate) || candidate.value == null) return false;
  return isMeta(candidate.meta);
};

/**
 * Builds a Source of Truth keyed by the schema's id field. `write` validates the
 * whole batch atomically (any failure → nothing written), then converges each
 * entity, retaining accepted tombstones in storage.
 */
export const makeSourceOfTruth = <TItem>(args: {
  schema: AnyEntityESchema;
  group: OfflineStorageGroup;
}): SourceOfTruth<TItem> => {
  const { schema, group } = args;
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
        const entries: Array<{ key: string; value: EntityType<TItem> }> = [];

        // One client-receipt timestamp for the whole batch — the `_c` stamp marks
        // when this delivery arrived, which is shared across its entities.
        const clientNow = yield* Clock.currentTimeMillis;

        for (const incoming of entities) {
          const id = idOf(incoming)!;
          const current = yield* group
            .get<EntityType<TItem>>(id)
            .pipe(
              Effect.mapError((cause) =>
                storageError('failed to read Source of Truth entity', cause),
              ),
            );
          if (converge(current, incoming) === 'skip') {
            // The value is stale by `_u`, but a present `_s` (the server-settle
            // marker) must still be reconciled onto the stored record so the
            // cadence view reflects the latest delivery. Meta-only — the value
            // is untouched.
            if (
              current != null &&
              !current.meta._d &&
              incoming.meta._s != null &&
              incoming.meta._s !== current.meta._s
            ) {
              const merged = {
                ...current,
                meta: { ...current.meta, _s: incoming.meta._s, _c: clientNow },
              } as EntityType<TItem>;
              entries.push({ key: id, value: merged });
              upserts.push(merged);
            }
            continue;
          }
          const stamped = {
            ...incoming,
            meta: { ...incoming.meta, _c: clientNow },
          } as EntityType<TItem>;
          entries.push({ key: id, value: stamped });
          if (stamped.meta._d) tombstoned.push(id);
          else upserts.push(stamped);
        }

        if (entries.length > 0) {
          yield* group
            .putMany(entries)
            .pipe(
              Effect.mapError((cause) =>
                storageError('failed to write Source of Truth entities', cause),
              ),
            );
        }

        return { upserts, tombstoned };
      }),
    getAll: () =>
      group.getAll<EntityType<TItem>>().pipe(
        Effect.map((entries) =>
          entries.map(({ value }) => value).filter((entity) => !entity.meta._d),
        ),
        Effect.mapError((cause) =>
          storageError('failed to read Source of Truth entities', cause),
        ),
      ),
    get: (id) =>
      group
        .get<EntityType<TItem>>(id)
        .pipe(
          Effect.mapError((cause) =>
            storageError('failed to read Source of Truth entity', cause),
          ),
        ),
  };
};
