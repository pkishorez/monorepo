import { Clock, Effect } from 'effect';
import {
  EntitySchema,
  type DecodedEntity,
  type EncodedEntity,
} from '../../../core/index.js';
import { ESchemaError, type AnyESchema } from '../../../eschema/index.js';
import { DatabaseError } from '../../../db/index.js';
import { converge } from './entity-convergence.js';
import { isDecodedEntity } from '../../domain/entity-validation/index.js';
import {
  HYDRATION_PAGE_SIZE,
  REPLICA_READ_CONCURRENCY,
  REPLICA_TRANSACT_LIMIT,
} from './tuning.js';
import {
  storageError,
  type WriteError,
} from '../../domain/sync-error/index.js';
import {
  storedReplicaCursorEntity,
  storedReplicaEntity,
  syncStore,
  type StoredReplicaValue,
} from '../../domain/stored-entity/index.js';
import type { SyncStore } from '../../platform/sync-store/index.js';

type Delta<TItem> = {
  entities: DecodedEntity<TItem>[];
  position: string | null;
};

type SyncReplica<TItem> = {
  applyToSyncReplica: (
    entities: DecodedEntity<TItem>[],
  ) => Effect.Effect<DecodedEntity<TItem>[], WriteError>;
  since: (position: string | null) => Effect.Effect<Delta<TItem>, WriteError>;
  /** Streams the rows after `position` one page at a time; resolves with the last position read. */
  eachPage: <E>(
    position: string | null,
    onPage: (page: Delta<TItem>) => Effect.Effect<void, E>,
  ) => Effect.Effect<{ position: string | null; rows: number }, WriteError | E>;
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

  type Candidate = {
    id: string;
    decoded: DecodedEntity<TItem>;
    encoded: EncodedEntity<S['Encoded']>;
  };

  type Outcome = {
    readonly id: string;
    readonly accepted: EncodedEntity<unknown>;
    readonly decoded: DecodedEntity<TItem>;
    readonly repaired: boolean;
    readonly observedSeq: string | null;
  };

  const decide = (
    candidate: Candidate,
    currentStored: DecodedEntity<StoredReplicaValue> | null,
    clientNow: number,
  ): Outcome | null => {
    const { id, decoded, encoded: incoming } = candidate;
    const incomingWithReceipt: EncodedEntity<S['Encoded']> = {
      ...incoming,
      meta: { ...incoming.meta, _c: clientNow },
    };
    const observedSeq = currentStored === null ? null : currentStored.value.seq;
    if (currentStored === null)
      return {
        id,
        accepted: incomingWithReceipt,
        decoded,
        repaired: false,
        observedSeq,
      };
    const current = currentStored.value.entity as EncodedEntity<unknown>;
    if (converge(current, incoming) !== 'skip')
      return {
        id,
        accepted: incomingWithReceipt,
        decoded,
        repaired: false,
        observedSeq,
      };
    if (
      !current.meta._d &&
      incoming.meta._s != null &&
      incoming.meta._s !== current.meta._s
    )
      return {
        id,
        accepted: {
          ...current,
          meta: { ...current.meta, _s: incoming.meta._s, _c: clientNow },
        },
        decoded,
        repaired: true,
        observedSeq,
      };
    return null;
  };

  const acceptedOf = (
    outcome: Outcome,
    clientNow: number,
  ): Effect.Effect<DecodedEntity<TItem> | null, ESchemaError> => {
    if (!outcome.repaired)
      return Effect.succeed({
        ...outcome.decoded,
        meta: { ...outcome.decoded.meta, _c: clientNow },
      });
    return entitySchema
      .decode(outcome.accepted)
      .pipe(Effect.result)
      .pipe(
        Effect.map((decoded) =>
          decoded._tag === 'Success' ? decoded.success : null,
        ),
      );
  };

  const CHUNK = REPLICA_TRANSACT_LIMIT - 1;

  const commitChunk = (
    chunk: readonly Outcome[],
    observedPosition: string | null,
  ): Effect.Effect<
    { readonly position: string },
    DatabaseError | ESchemaError
  > =>
    Effect.gen(function* () {
      const cursorKey = { collection, key: CURSOR_KEY };
      let seq = observedPosition;
      const rowOps = [];
      for (const outcome of chunk) {
        seq = nextSequence(seq);
        rowOps.push(
          outcome.observedSeq === null
            ? yield* storedReplicaEntity.insertOp({
                collection,
                key: outcome.id,
                seq,
                entity: outcome.accepted,
              })
            : yield* storedReplicaEntity.getAndUpdateOp(
                { collection, key: outcome.id },
                { seq, entity: outcome.accepted },
                { check: (stored) => stored.seq === outcome.observedSeq },
              ),
        );
      }
      const position = seq as string;
      const cursorOp =
        observedPosition === null
          ? yield* storedReplicaCursorEntity.insertOp({
              ...cursorKey,
              position,
            })
          : yield* storedReplicaCursorEntity.getAndUpdateOp(
              cursorKey,
              { position },
              { check: (latest) => latest.position === observedPosition },
            );
      yield* syncStore.transact([cursorOp, ...rowOps]);
      return { position };
    }).pipe((effect) =>
      args.store.provide(effect, {
        collection,
        operation: 'transact',
        record: 'sync-replica',
      }),
    );

  const writeBatch = (
    candidates: readonly Candidate[],
    clientNow: number,
    retries: number,
  ): Effect.Effect<DecodedEntity<TItem>[], DatabaseError | ESchemaError> =>
    Effect.gen(function* () {
      if (candidates.length === 0) return [];
      const cursorKey = { collection, key: CURSOR_KEY };
      const cursor = yield* args.store.provide(
        storedReplicaCursorEntity.get(cursorKey),
        { collection, operation: 'get', record: 'sync-replica' },
      );
      const stored = yield* args.store.provide(
        Effect.forEach(
          candidates,
          (candidate) => storedReplicaEntity.get(key(candidate.id)),
          { concurrency: REPLICA_READ_CONCURRENCY },
        ),
        { collection, operation: 'get', record: 'sync-replica' },
      );
      const outcomes: Outcome[] = [];
      for (const [index, candidate] of candidates.entries()) {
        const outcome = decide(candidate, stored[index] ?? null, clientNow);
        if (outcome !== null) outcomes.push(outcome);
      }

      const acceptedEntities: DecodedEntity<TItem>[] = [];
      let position = cursor === null ? null : cursor.value.position;
      let committed = 0;
      while (committed < outcomes.length) {
        const chunk = outcomes.slice(committed, committed + CHUNK);
        const result = yield* commitChunk(chunk, position).pipe(Effect.result);
        if (result._tag === 'Failure') {
          if (
            retries > 0 &&
            result.failure instanceof DatabaseError &&
            result.failure.reason._tag === 'TransactFailed'
          ) {
            const remaining = new Set(
              outcomes.slice(committed).map((outcome) => outcome.id),
            );
            const retried = yield* writeBatch(
              candidates.filter((candidate) => remaining.has(candidate.id)),
              clientNow,
              retries - 1,
            );
            return [...acceptedEntities, ...retried];
          }
          return yield* Effect.fail(result.failure);
        }
        position = result.success.position;
        committed += chunk.length;
        for (const outcome of chunk) {
          const accepted = yield* acceptedOf(outcome, clientNow);
          if (accepted !== null) acceptedEntities.push(accepted);
        }
      }
      return acceptedEntities;
    });

  const eachPage = <E>(
    position: string | null,
    onPage: (page: Delta<TItem>) => Effect.Effect<void, E>,
  ): Effect.Effect<{ position: string | null; rows: number }, WriteError | E> =>
    Effect.gen(function* () {
      let latest = position;
      let rows = 0;
      let after: DecodedEntity<StoredReplicaValue> | undefined;
      let hasMore = true;
      while (hasMore) {
        const page = yield* args.store
          .provide(
            storedReplicaEntity.query(
              'bySequence',
              position === null
                ? { pk: { collection }, '>': null }
                : { pk: { collection }, '>': { seq: position } },
              {
                limit: HYDRATION_PAGE_SIZE,
                ...(after === undefined ? {} : { after }),
              },
            ),
            { collection, operation: 'query', record: 'sync-replica' },
          )
          .pipe(
            Effect.mapError(storeError('failed to read Sync Replica entities')),
          );
        const entities: DecodedEntity<TItem>[] = [];
        for (const item of page.items) {
          entities.push(
            yield* storedEntity(item.value).pipe(
              Effect.mapError(invalidEntity),
            ),
          );
          latest = item.value.seq;
        }
        if (entities.length > 0) {
          rows += entities.length;
          yield* onPage({ entities, position: latest });
        }
        hasMore = page.hasMore;
        after = page.items.at(-1);
        if (after === undefined) break;
      }
      return { position: latest, rows };
    });

  return {
    eachPage,
    applyToSyncReplica: (entities) =>
      Effect.gen(function* () {
        const validated: Candidate[] = [];
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
        return yield* writeBatch(
          [...newest].map(([id, { decoded, encoded }]) => ({
            id,
            decoded,
            encoded,
          })),
          clientNow,
          10,
        ).pipe(
          Effect.mapError((cause) =>
            cause instanceof DatabaseError
              ? storeError('failed to apply Sync Replica entities')(cause)
              : invalidEntity(cause),
          ),
        );
      }),
    since: (position) =>
      Effect.gen(function* () {
        const entities: DecodedEntity<TItem>[] = [];
        const read = yield* eachPage(position, (page) =>
          Effect.sync(() => {
            entities.push(...page.entities);
          }),
        );
        return { entities, position: read.position };
      }),
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
