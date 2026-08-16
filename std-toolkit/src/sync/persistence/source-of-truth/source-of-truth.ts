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
  storedSourceCursorEntity,
  storedSourceEntity,
  syncPersistenceTable,
  type StoredSourceValue,
  type SyncPersistence,
} from '../sync-persistence-table/index.js';

export type Accepted<TItem> = {
  upserts: EntityType<TItem>[];
  tombstoned: string[];
};

export type Delta<TItem> = {
  entities: EntityType<TItem>[];
  position: string | null;
};

export type SourceOfTruth<TItem> = {
  write: (
    entities: EntityType<TItem>[],
  ) => Effect.Effect<Accepted<TItem>, WriteError>;
  since: (position: string | null) => Effect.Effect<Delta<TItem>, WriteError>;
  get: (id: string) => Effect.Effect<EntityType<TItem> | null, WriteError>;
};

const storedEntity = <TItem>(stored: StoredSourceValue): EntityType<TItem> => ({
  value: stored.value as TItem,
  meta: stored.meta,
});

const persistenceError = (reason: string) => (cause: DatabaseError) =>
  storageError(reason, cause);

const CURSOR_KEY = 'source';
const SEQUENCE_WIDTH = 32;

const nextSequence = (position: string | null): string =>
  (position === null ? 1n : BigInt(position) + 1n)
    .toString()
    .padStart(SEQUENCE_WIDTH, '0');

export const makeSourceOfTruth = <TItem>(args: {
  persistence: SyncPersistence;
  schema?: AnyESchema & { readonly idField?: string };
  entityName?: string;
  collectionName?: string;
  keyOf?: (value: TItem) => string | null;
}): SourceOfTruth<TItem> => {
  const isValue = args.schema ? Schema.is(args.schema.schema) : null;
  const entityName = args.schema?.name ?? args.entityName;
  if (!entityName) throw new Error('Source of Truth requires an entity name');
  const collection = args.collectionName ?? entityName;

  const idOf = (entity: EntityType<TItem>): string | null => {
    if (args.keyOf) return args.keyOf(entity.value);
    const idField = args.schema?.idField;
    if (!idField) return null;
    const id = (entity.value as Record<string, unknown>)[idField];
    return typeof id === 'string' ? id : null;
  };

  const key = (id: string) => ({ collection, key: id });

  const writeOne = (
    id: string,
    incoming: EntityType<TItem>,
    clientNow: number,
  ): Effect.Effect<EntityType<TItem> | null, DatabaseError> => {
    const attempt = (
      retries: number,
    ): Effect.Effect<EntityType<TItem> | null, DatabaseError> =>
      Effect.gen(function* () {
        const cursorKey = { collection, key: CURSOR_KEY };
        const cursor = yield* storedSourceCursorEntity.get(cursorKey);
        let assigned: string | null = null;
        let cursorOp;
        if (cursor === null) {
          assigned = nextSequence(null);
          cursorOp = yield* storedSourceCursorEntity.insertOp({
            ...cursorKey,
            position: assigned,
          });
        } else {
          cursorOp = yield* storedSourceCursorEntity.getAndUpdateOp(
            cursorKey,
            (latest) => {
              assigned = nextSequence(latest.position);
              return { position: assigned };
            },
          );
        }
        if (assigned === null) {
          return yield* Effect.die(
            new Error(
              `Projection Sequence was not assigned for '${collection}'`,
            ),
          );
        }
        const seq: string = assigned;

        const currentStored = yield* storedSourceEntity.get(key(id));
        let accepted: EntityType<TItem> | null = null;
        const sourceOp =
          currentStored === null
            ? yield* storedSourceEntity.insertOp({
                collection,
                key: id,
                seq,
                value: incoming.value as {} | null,
                meta: { ...incoming.meta, _c: clientNow },
              })
            : yield* storedSourceEntity.getAndUpdateOp(key(id), (stored) => {
                const current = storedEntity<TItem>(stored);
                if (converge(current, incoming) !== 'skip') {
                  accepted = {
                    ...incoming,
                    meta: { ...incoming.meta, _c: clientNow },
                  };
                } else if (
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
                }
                return accepted === null
                  ? {}
                  : {
                      seq,
                      value: accepted.value as {} | null,
                      meta: accepted.meta,
                    };
              });

        if (currentStored === null) {
          accepted = {
            ...incoming,
            meta: { ...incoming.meta, _c: clientNow },
          };
        }
        if (accepted === null) return null;

        const result = yield* syncPersistenceTable
          .transact([cursorOp, sourceOp])
          .pipe(Effect.result);
        if (result._tag === 'Success') return accepted;
        if (retries > 0 && result.failure.reason._tag === 'TransactFailed') {
          return yield* attempt(retries - 1);
        }
        return yield* Effect.fail(result.failure);
      }).pipe((effect) =>
        args.persistence.provide(effect, {
          collection,
          operation: 'transact',
          record: 'source-of-truth',
        }),
      );

    return attempt(10);
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
    since: (position) =>
      Effect.gen(function* () {
        const entities: EntityType<TItem>[] = [];
        let latest = position;
        let after: EntityType<StoredSourceValue> | undefined;
        let hasMore = true;
        while (hasMore) {
          const page = yield* args.persistence.provide(
            storedSourceEntity.query(
              'bySequence',
              position === null
                ? { pk: { collection }, '>': null }
                : { pk: { collection }, '>': { seq: position } },
              { limit: 100, ...(after === undefined ? {} : { after }) },
            ),
            { collection, operation: 'query', record: 'source-of-truth' },
          );
          for (const item of page.items) {
            entities.push(storedEntity<TItem>(item.value));
            latest = item.value.seq;
          }
          hasMore = page.hasMore;
          after = page.items.at(-1);
          if (after === undefined) break;
        }
        return { entities, position: latest };
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
