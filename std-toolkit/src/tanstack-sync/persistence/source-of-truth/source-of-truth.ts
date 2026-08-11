import { Clock, Effect, Schema, Semaphore } from 'effect';
import type { EntityType } from '../../../core/index.js';
import type { AnyESchema } from '../../../eschema/index.js';
import type { OfflineStorageGroup } from '../offline-storage/index.js';
import { converge } from '../../domain/entity-convergence/index.js';
import {
  storageError,
  type WriteError,
} from '../../domain/sync-error/index.js';
import { isEntity } from '../../domain/entity-validation/index.js';

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

/**
 * Builds a Source of Truth keyed by the schema's id field. `write` validates the
 * whole batch atomically (any failure → nothing written), then converges each
 * entity, retaining accepted tombstones in storage.
 */
export const makeSourceOfTruth = <TItem>(args: {
  group: OfflineStorageGroup;
  schema?: AnyESchema & { readonly idField?: string };
  entityName?: string;
  keyOf?: (value: TItem) => string | null;
}): SourceOfTruth<TItem> => {
  const { group } = args;
  const writes = Semaphore.makeUnsafe(1);
  const isValue = args.schema ? Schema.is(args.schema.schema) : null;
  const entityName = args.schema?.name ?? args.entityName;
  if (!entityName) throw new Error('Source of Truth requires an entity name');

  const idOf = (entity: EntityType<TItem>): string | null => {
    if (args.keyOf) return args.keyOf(entity.value);
    const idField = args.schema?.idField;
    if (!idField) return null;
    const id = (entity.value as Record<string, unknown>)[idField];
    return typeof id === 'string' ? id : null;
  };

  return {
    write: (entities) =>
      writes.withPermit(
        Effect.gen(function* () {
          for (const entity of entities) {
            if (!isEntity(entity)) {
              return yield* Effect.fail<WriteError>({
                _tag: 'Invalid',
                reason: 'entity is missing value or a well-formed meta',
              });
            }
            if (entity.meta._e !== entityName) {
              return yield* Effect.fail<WriteError>({
                _tag: 'WrongEntity',
                expected: entityName,
                received: entity.meta._e,
              });
            }
            if (isValue && !isValue(entity.value)) {
              return yield* Effect.fail<WriteError>({
                _tag: 'Invalid',
                reason: `entity value does not match schema "${entityName}"`,
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
                  meta: {
                    ...current.meta,
                    _s: incoming.meta._s,
                    _c: clientNow,
                  },
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
                  storageError(
                    'failed to write Source of Truth entities',
                    cause,
                  ),
                ),
              );
          }

          return { upserts, tombstoned };
        }),
      ),
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
