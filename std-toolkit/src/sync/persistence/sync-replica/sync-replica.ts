import { Clock, Effect } from 'effect';
import {
  EntitySchema,
  type DecodedEntity,
  type EncodedEntity,
} from '../../../core/index.js';
import { ESchemaError, type AnyESchema } from '../../../eschema/index.js';
import { DatabaseError } from '../../../db/index.js';
import { converge } from '../../domain/entity-convergence/index.js';
import { isDecodedEntity } from '../../domain/entity-validation/index.js';
import {
  storageError,
  type WriteError,
} from '../../domain/sync-error/index.js';
import {
  storedReplicaCursorEntity,
  storedReplicaEntity,
  syncStore,
  type StoredReplicaValue,
  type SyncStore,
} from '../sync-store/index.js';

type Delta<TItem> = {
  entities: DecodedEntity<TItem>[];
  position: string | null;
};

type SyncReplica<TItem> = {
  applyToSyncReplica: (
    entities: DecodedEntity<TItem>[],
  ) => Effect.Effect<DecodedEntity<TItem>[], WriteError>;
  since: (position: string | null) => Effect.Effect<Delta<TItem>, WriteError>;
  get: (id: string) => Effect.Effect<DecodedEntity<TItem> | null, WriteError>;
};

const storeError = (reason: string) => (cause: DatabaseError) =>
  storageError(reason, cause);

const invalidEntity = (cause: ESchemaError): WriteError => ({
  _tag: 'Invalid',
  reason: cause.message,
});

const CURSOR_KEY = 'replica';
const SEQUENCE_WIDTH = 32;

const nextSequence = (position: string | null): string =>
  (position === null ? 1n : BigInt(position) + 1n)
    .toString()
    .padStart(SEQUENCE_WIDTH, '0');

export const makeSyncReplica = <S extends AnyESchema>(args: {
  store: SyncStore;
  schema: S;
  collectionName?: string;
  keyOf?: (value: S['Type']) => string | null;
}): SyncReplica<S['Type']> => {
  type TItem = S['Type'];
  const entitySchema = EntitySchema(args.schema);
  const entityName = args.schema.name;
  const collection = args.collectionName ?? entityName;

  const idOf = (entity: DecodedEntity<TItem>): string | null => {
    if (args.keyOf) return args.keyOf(entity.value);
    const idField =
      'idField' in args.schema && typeof args.schema.idField === 'string'
        ? args.schema.idField
        : null;
    if (idField === null) return null;
    const id = (entity.value as Record<string, unknown>)[idField];
    return typeof id === 'string' ? id : null;
  };

  const key = (id: string) => ({ collection, key: id });

  const storedEntity = (stored: StoredReplicaValue) =>
    entitySchema.decode(stored.entity);

  const writeOne = (
    id: string,
    incoming: EncodedEntity<S['Encoded']>,
    incomingDecoded: DecodedEntity<TItem>,
    clientNow: number,
  ): Effect.Effect<
    DecodedEntity<TItem> | null,
    DatabaseError | ESchemaError
  > => {
    const attempt = (
      retries: number,
    ): Effect.Effect<
      DecodedEntity<TItem> | null,
      DatabaseError | ESchemaError
    > =>
      Effect.gen(function* () {
        const cursorKey = { collection, key: CURSOR_KEY };
        const cursor = yield* storedReplicaCursorEntity.get(cursorKey);
        let assigned: string | null = null;
        const cursorOp =
          cursor === null
            ? yield* storedReplicaCursorEntity.insertOp({
                ...cursorKey,
                position: (assigned = nextSequence(null)),
              })
            : yield* storedReplicaCursorEntity.getAndUpdateOp(
                cursorKey,
                (latest) => ({
                  position: (assigned = nextSequence(latest.position)),
                }),
              );
        if (assigned === null) {
          return yield* Effect.die(
            new Error(
              `Projection Sequence was not assigned for '${collection}'`,
            ),
          );
        }
        const seq: string = assigned;

        const currentStored = yield* storedReplicaEntity.get(key(id));
        let accepted: EncodedEntity<unknown> | null = null;
        let repaired: boolean = false;
        const incomingWithReceipt: EncodedEntity<S['Encoded']> = {
          ...incoming,
          meta: { ...incoming.meta, _c: clientNow },
        };
        const replicaOp =
          currentStored === null
            ? yield* storedReplicaEntity.insertOp({
                collection,
                key: id,
                seq,
                entity: (accepted = incomingWithReceipt),
              })
            : yield* storedReplicaEntity.getAndUpdateOp(key(id), (stored) => {
                const current = stored.entity as EncodedEntity<unknown>;
                if (converge(current, incoming) !== 'skip') {
                  accepted = incomingWithReceipt;
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
                  repaired = true;
                }
                return accepted === null ? {} : { seq, entity: accepted };
              });

        if (accepted === null) return null;
        const result = yield* syncStore
          .transact([cursorOp, replicaOp])
          .pipe(Effect.result);
        if (result._tag === 'Success') {
          if (!repaired) {
            return {
              ...incomingDecoded,
              meta: { ...incomingDecoded.meta, _c: clientNow },
            };
          }
          // A repaired entity is stored data, so it can predate this build's schema.
          const decoded = yield* entitySchema
            .decode(accepted)
            .pipe(Effect.result);
          return decoded._tag === 'Success' ? decoded.success : null;
        }
        if (retries > 0 && result.failure.reason._tag === 'TransactFailed') {
          return yield* attempt(retries - 1);
        }
        return yield* Effect.fail(result.failure);
      }).pipe((effect) =>
        args.store.provide(effect, {
          collection,
          operation: 'transact',
          record: 'sync-replica',
        }),
      );

    return attempt(10);
  };

  return {
    applyToSyncReplica: (entities) =>
      Effect.gen(function* () {
        const validated: Array<{
          id: string;
          decoded: DecodedEntity<TItem>;
          encoded: EncodedEntity<S['Encoded']>;
        }> = [];
        for (const decoded of entities) {
          if (!isDecodedEntity(decoded)) {
            return yield* Effect.fail<WriteError>({
              _tag: 'Invalid',
              reason: 'entity is missing value or a well-formed meta',
            });
          }
          if (decoded.meta._e !== entityName) {
            return yield* Effect.fail<WriteError>({
              _tag: 'WrongEntity',
              expected: entityName,
              received: decoded.meta._e,
            });
          }
          const encoded = yield* entitySchema
            .encode(decoded)
            .pipe(Effect.mapError(invalidEntity));
          const id = idOf(decoded);
          if (id == null) {
            return yield* Effect.fail<WriteError>({
              _tag: 'MissingId',
              entity: decoded,
            });
          }
          validated.push({ id, decoded, encoded });
        }

        const newest = new Map<
          string,
          {
            decoded: DecodedEntity<TItem>;
            encoded: EncodedEntity<S['Encoded']>;
          }
        >();
        for (const { id, decoded, encoded } of validated) {
          const current = newest.get(id);
          if (
            current === undefined ||
            decoded.meta._u > current.decoded.meta._u
          ) {
            newest.set(id, { decoded, encoded });
          } else if (
            decoded.meta._u === current.decoded.meta._u &&
            decoded.meta._s != null &&
            decoded.meta._s !== current.decoded.meta._s
          ) {
            const next = {
              ...current.decoded,
              meta: { ...current.decoded.meta, _s: decoded.meta._s },
            };
            newest.set(id, {
              decoded: next,
              encoded: yield* entitySchema
                .encode(next)
                .pipe(Effect.mapError(invalidEntity)),
            });
          }
        }

        const clientNow = yield* Clock.currentTimeMillis;
        const acceptedEntities: DecodedEntity<TItem>[] = [];
        for (const [id, { decoded, encoded }] of newest) {
          const accepted = yield* writeOne(
            id,
            encoded,
            decoded,
            clientNow,
          ).pipe(
            Effect.mapError((cause) =>
              cause instanceof DatabaseError
                ? storeError('failed to apply Sync Replica entities')(cause)
                : invalidEntity(cause),
            ),
          );
          if (accepted !== null) acceptedEntities.push(accepted);
        }
        return acceptedEntities;
      }),
    since: (position) =>
      Effect.gen(function* () {
        const entities: DecodedEntity<TItem>[] = [];
        let latest = position;
        let after: DecodedEntity<StoredReplicaValue> | undefined;
        let hasMore = true;
        while (hasMore) {
          const page = yield* args.store.provide(
            storedReplicaEntity.query(
              'bySequence',
              position === null
                ? { pk: { collection }, '>': null }
                : { pk: { collection }, '>': { seq: position } },
              { limit: 100, ...(after === undefined ? {} : { after }) },
            ),
            { collection, operation: 'query', record: 'sync-replica' },
          );
          for (const item of page.items) {
            entities.push(yield* storedEntity(item.value));
            latest = item.value.seq;
          }
          hasMore = page.hasMore;
          after = page.items.at(-1);
          if (after === undefined) break;
        }
        return { entities, position: latest };
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof DatabaseError
            ? storeError('failed to read Sync Replica entities')(cause)
            : invalidEntity(cause),
        ),
      ),
    get: (id) =>
      Effect.gen(function* () {
        const stored = yield* args.store.provide(
          storedReplicaEntity.get(key(id)),
          { collection, operation: 'get', record: 'sync-replica' },
        );
        return stored === null ? null : yield* storedEntity(stored.value);
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof DatabaseError
            ? storeError('failed to read Sync Replica entity')(cause)
            : invalidEntity(cause),
        ),
      ),
  };
};
