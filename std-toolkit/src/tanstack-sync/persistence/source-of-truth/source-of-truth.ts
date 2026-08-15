import { Clock, Effect, Schema } from 'effect';
import type { EntityType } from '../../../core/index.js';
import type { AnyESchema } from '../../../eschema/index.js';
import type { DatabaseError } from '../../../db/index.js';
import { converge } from '../../domain/entity-convergence/index.js';
import {
  storageError,
  type WriteError,
} from '../../domain/sync-error/index.js';
import { isEntity } from '../../domain/entity-validation/index.js';
import {
  storedSourceEntity,
  type StoredSourceValue,
  type SyncPersistence,
} from '../sync-persistence-table/index.js';

export type Accepted<TItem> = {
  upserts: EntityType<TItem>[];
  tombstoned: string[];
};

export type SourceOfTruth<TItem> = {
  write: (
    entities: EntityType<TItem>[],
  ) => Effect.Effect<Accepted<TItem>, WriteError>;
  getAll: () => Effect.Effect<EntityType<TItem>[], WriteError>;
  get: (id: string) => Effect.Effect<EntityType<TItem> | null, WriteError>;
};

const storedEntity = <TItem>(stored: StoredSourceValue): EntityType<TItem> => ({
  value: stored.value as TItem,
  meta: stored.meta,
});

const persistenceError = (reason: string) => (cause: DatabaseError) =>
  storageError(reason, cause);

export const makeSourceOfTruth = <TItem>(args: {
  persistence: SyncPersistence;
  schema?: AnyESchema & { readonly idField?: string };
  entityName?: string;
  keyOf?: (value: TItem) => string | null;
}): SourceOfTruth<TItem> => {
  const isValue = args.schema ? Schema.is(args.schema.schema) : null;
  const collection = args.schema?.name ?? args.entityName;
  if (!collection) throw new Error('Source of Truth requires an entity name');

  const idOf = (entity: EntityType<TItem>): string | null => {
    if (args.keyOf) return args.keyOf(entity.value);
    const idField = args.schema?.idField;
    if (!idField) return null;
    const id = (entity.value as Record<string, unknown>)[idField];
    return typeof id === 'string' ? id : null;
  };

  const key = (id: string) => ({ collection, key: id });

  const updateExisting = (
    id: string,
    incoming: EntityType<TItem>,
    clientNow: number,
  ): Effect.Effect<EntityType<TItem> | null, DatabaseError> => {
    let accepted: EntityType<TItem> | null = null;
    return args.persistence
      .provide(
        storedSourceEntity.getAndUpdate(
          key(id),
          (stored) => {
            const current = storedEntity<TItem>(stored);
            if (converge(current, incoming) === 'skip') {
              if (
                !current.meta._d &&
                incoming.meta._s != null &&
                incoming.meta._s !== current.meta._s
              ) {
                accepted = {
                  ...current,
                  meta: {
                    ...current.meta,
                    _s: incoming.meta._s,
                    _c: clientNow,
                  },
                };
                return {
                  value: accepted.value as {} | null,
                  meta: accepted.meta,
                };
              }
              accepted = null;
              return null;
            }
            accepted = {
              ...incoming,
              meta: { ...incoming.meta, _c: clientNow },
            };
            return {
              value: accepted.value as {} | null,
              meta: accepted.meta,
            };
          },
          { retries: 10 },
        ),
        { collection, operation: 'update', record: 'source-of-truth' },
      )
      .pipe(Effect.map(() => accepted));
  };

  const writeOne = (
    id: string,
    incoming: EntityType<TItem>,
    clientNow: number,
  ): Effect.Effect<EntityType<TItem> | null, DatabaseError> => {
    const stamped: EntityType<TItem> = {
      ...incoming,
      meta: { ...incoming.meta, _c: clientNow },
    };
    return args.persistence
      .provide(
        storedSourceEntity.insert({
          collection,
          key: id,
          value: stamped.value as {} | null,
          meta: stamped.meta,
        }),
        { collection, operation: 'insert', record: 'source-of-truth' },
      )
      .pipe(
        Effect.as(stamped),
        Effect.catch((error) =>
          error.reason._tag === 'ItemAlreadyExists'
            ? updateExisting(id, incoming, clientNow)
            : Effect.fail(error),
        ),
      );
  };

  return {
    write: (entities) =>
      Effect.gen(function* () {
        const validated: Array<{
          id: string;
          entity: EntityType<TItem>;
        }> = [];
        for (const entity of entities) {
          if (!isEntity(entity)) {
            return yield* Effect.fail<WriteError>({
              _tag: 'Invalid',
              reason: 'entity is missing value or a well-formed meta',
            });
          }
          if (entity.meta._e !== collection) {
            return yield* Effect.fail<WriteError>({
              _tag: 'WrongEntity',
              expected: collection,
              received: entity.meta._e,
            });
          }
          if (isValue && !isValue(entity.value)) {
            return yield* Effect.fail<WriteError>({
              _tag: 'Invalid',
              reason: `entity value does not match schema "${collection}"`,
            });
          }
          const id = idOf(entity);
          if (id == null) {
            return yield* Effect.fail<WriteError>({
              _tag: 'MissingId',
              entity,
            });
          }
          validated.push({ id, entity });
        }

        const newest = new Map<string, EntityType<TItem>>();
        for (const { id, entity } of validated) {
          const current = newest.get(id);
          if (current === undefined || entity.meta._u > current.meta._u) {
            newest.set(id, entity);
          } else if (
            entity.meta._u === current.meta._u &&
            entity.meta._s != null &&
            entity.meta._s !== current.meta._s
          ) {
            newest.set(id, {
              ...current,
              meta: { ...current.meta, _s: entity.meta._s },
            });
          }
        }

        const clientNow = yield* Clock.currentTimeMillis;
        const upserts: EntityType<TItem>[] = [];
        const tombstoned: string[] = [];
        for (const [id, entity] of newest) {
          const accepted = yield* writeOne(id, entity, clientNow).pipe(
            Effect.mapError(
              persistenceError('failed to write Source of Truth entities'),
            ),
          );
          if (accepted === null) continue;
          if (accepted.meta._d) tombstoned.push(id);
          else upserts.push(accepted);
        }
        return { upserts, tombstoned };
      }),
    getAll: () =>
      Effect.gen(function* () {
        const entities: EntityType<TItem>[] = [];
        let after: EntityType<StoredSourceValue> | undefined;
        let hasMore = true;
        while (hasMore) {
          const page = yield* args.persistence.provide(
            storedSourceEntity.query(
              'primary',
              { pk: { collection }, '>': null },
              { limit: 100, ...(after === undefined ? {} : { after }) },
            ),
            { collection, operation: 'query', record: 'source-of-truth' },
          );
          for (const item of page.items) {
            if (!item.value.meta._d) {
              entities.push(storedEntity<TItem>(item.value));
            }
          }
          hasMore = page.hasMore;
          after = page.items.at(-1);
          if (after === undefined) break;
        }
        return entities;
      }).pipe(
        Effect.mapError(
          persistenceError('failed to read Source of Truth entities'),
        ),
      ),
    get: (id) =>
      args.persistence
        .provide(storedSourceEntity.get(key(id)), {
          collection,
          operation: 'get',
          record: 'source-of-truth',
        })
        .pipe(
          Effect.map((stored) =>
            stored === null ? null : storedEntity<TItem>(stored.value),
          ),
          Effect.mapError(
            persistenceError('failed to read Source of Truth entity'),
          ),
        ),
  };
};
