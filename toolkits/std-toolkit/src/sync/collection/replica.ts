import { Effect, Schema } from 'effect';
import type { Entity } from '../../core/index.js';
import { DatabaseError, type StdTableService } from '../../db/index.js';
import { ESchemaError, type AnyEntityESchema } from '../../eschema/index.js';
import { isEntity } from '../domain/entity-validation/index.js';
import {
  storedReplicaCursorEntity,
  storedReplicaEntity,
  syncStore,
  type SYNC_STORE_TABLE,
  type StoredReplicaValue,
} from '../domain/stored-entity/index.js';
import { storageError, type WriteError } from '../domain/sync-error/index.js';
import type { StoreRuntime } from '../store/store-runtime/index.js';
import {
  HYDRATION_PAGE_SIZE,
  REPLICA_READ_CONCURRENCY,
  REPLICA_TRANSACT_LIMIT,
} from './tuning.js';

/** One more operation to write in the same transaction as the Entities. */
export type StoreOp = Parameters<typeof syncStore.transact>[0][number];

export type ExtraOp = Effect.Effect<
  StoreOp,
  WriteError,
  StdTableService<typeof SYNC_STORE_TABLE>
>;

type Page<TItem> = {
  readonly entities: Entity<TItem>[];
  readonly position: string | null;
};

export type SyncReplica<TItem> = {
  /**
   * Stores the Entities that win under the Convergence Rule, and `with` in the
   * last transaction, and returns the accepted ones.
   */
  apply: (
    entities: ReadonlyArray<Entity<TItem>>,
    with_?: ExtraOp,
  ) => Effect.Effect<Entity<TItem>[], WriteError>;
  /** Reads the rows stored after `position` one page at a time. */
  eachPage: <E>(
    position: string | null,
    onPage: (page: Page<TItem>) => Effect.Effect<void, E>,
  ) => Effect.Effect<string | null, WriteError | E>;
  validate: (
    entities: ReadonlyArray<Entity<TItem>>,
  ) => Effect.Effect<void, WriteError>;
};

const invalid = (cause: { readonly message: string }): WriteError => ({
  _tag: 'Invalid',
  reason: cause.message,
  cause,
});

const CURSOR_KEY = 'replica';
const SEQUENCE_WIDTH = 32;

const nextSequence = (position: string | null): string =>
  (position === null ? 1n : BigInt(position) + 1n)
    .toString()
    .padStart(SEQUENCE_WIDTH, '0');

// Every stored row gets the next local sequence number, so a reader can ask
// for everything written after the position it last read.
export const makeSyncReplica = <S extends AnyEntityESchema>(args: {
  store: StoreRuntime;
  schema: S;
  collection: string;
}): SyncReplica<S['Type']> => {
  type TItem = S['Type'];
  const { collection, schema, store } = args;
  const decodeEntity = Schema.decodeUnknownEffect(schema.entity);
  const encodeEntity = Schema.encodeEffect(schema.entity);

  const idOf = (entity: Entity<TItem>): string | null => {
    const id = (entity.value as Record<string, unknown>)[schema.idField];
    return typeof id === 'string' ? id : null;
  };

  const check = (entity: Entity<TItem>) =>
    Effect.gen(function* () {
      if (!isEntity(entity))
        return yield* Effect.fail<WriteError>({
          _tag: 'Invalid',
          reason: 'entity is missing value or a well-formed meta',
        });
      if (entity.meta._e !== schema.name)
        return yield* Effect.fail<WriteError>({
          _tag: 'WrongEntity',
          expected: schema.name,
          received: entity.meta._e,
        });
      return yield* encodeEntity(entity).pipe(Effect.mapError(invalid));
    });

  type Accepted = {
    readonly id: string;
    readonly entity: Entity<TItem>;
    readonly encoded: Entity<unknown>;
    readonly observedSeq: string | null;
  };

  // The cursor row is one op, and `with` another, in every transaction.
  const CHUNK = REPLICA_TRANSACT_LIMIT - 2;

  const commit = (
    chunk: readonly Accepted[],
    observed: string | null,
    extra: StoreOp | null,
  ) =>
    Effect.gen(function* () {
      const cursorKey = { collection, key: CURSOR_KEY };
      let seq = observed;
      const ops: StoreOp[] = [];
      for (const row of chunk) {
        seq = nextSequence(seq);
        ops.push(
          row.observedSeq === null
            ? yield* storedReplicaEntity.insertOp({
                collection,
                key: row.id,
                seq,
                entity: row.encoded,
              })
            : yield* storedReplicaEntity.getAndUpdateOp(
                { collection, key: row.id },
                { seq, entity: row.encoded },
                { check: (stored) => stored.seq === row.observedSeq },
              ),
        );
      }
      if (seq !== observed)
        ops.push(
          observed === null
            ? yield* storedReplicaCursorEntity.insertOp({
                ...cursorKey,
                position: seq!,
              })
            : yield* storedReplicaCursorEntity.getAndUpdateOp(
                cursorKey,
                { position: seq! },
                { check: (latest) => latest.position === observed },
              ),
        );
      if (extra !== null) ops.push(extra);
      if (ops.length > 0) yield* syncStore.transact(ops);
      return seq;
    });

  const write = (
    candidates: ReadonlyArray<{
      id: string;
      entity: Entity<TItem>;
      encoded: Entity<unknown>;
    }>,
    extra: ExtraOp | undefined,
    retries: number,
  ): Effect.Effect<
    Entity<TItem>[],
    WriteError | DatabaseError | ESchemaError
  > =>
    Effect.gen(function* () {
      const cursor = yield* store.provide(
        storedReplicaCursorEntity.get({ collection, key: CURSOR_KEY }),
      );
      const current = yield* store.provide(
        Effect.forEach(
          candidates,
          (candidate) =>
            storedReplicaEntity.get({ collection, key: candidate.id }),
          { concurrency: REPLICA_READ_CONCURRENCY },
        ),
      );
      const accepted: Accepted[] = [];
      candidates.forEach((candidate, index) => {
        const stored = current[index] ?? null;
        const existing = stored?.value.entity as Entity<unknown> | undefined;
        if (existing && candidate.entity.meta._u <= existing.meta._u) return;
        accepted.push({
          ...candidate,
          observedSeq: stored === null ? null : stored.value.seq,
        });
      });

      const chunks: Accepted[][] = [];
      for (let i = 0; i < accepted.length; i += CHUNK)
        chunks.push(accepted.slice(i, i + CHUNK));
      if (chunks.length === 0) chunks.push([]);

      let position = cursor === null ? null : cursor.value.position;
      let written = 0;
      for (const [index, chunk] of chunks.entries()) {
        const last = index === chunks.length - 1;
        const extraOp =
          last && extra !== undefined ? yield* store.provide(extra) : null;
        const result = yield* store
          .provide(commit(chunk, position, extraOp))
          .pipe(Effect.result);
        if (result._tag === 'Failure') {
          // Another writer moved a row or the cursor: re-read and try the rest.
          if (
            retries > 0 &&
            result.failure instanceof DatabaseError &&
            result.failure.reason._tag === 'TransactFailed'
          ) {
            const rest = accepted.slice(written);
            const retried = yield* write(rest, extra, retries - 1);
            return [
              ...accepted.slice(0, written).map((row) => row.entity),
              ...retried,
            ];
          }
          return yield* Effect.fail(result.failure);
        }
        position = result.success;
        written += chunk.length;
      }
      return accepted.map((row) => row.entity);
    });

  return {
    validate: (entities) => Effect.forEach(entities, check, { discard: true }),
    apply: (entities, extra) =>
      Effect.gen(function* () {
        // The newest Entity per id wins within a batch too.
        const newest = new Map<
          string,
          { id: string; entity: Entity<TItem>; encoded: Entity<unknown> }
        >();
        for (const entity of entities) {
          const encoded = yield* check(entity);
          const id = idOf(entity);
          if (id === null)
            return yield* Effect.fail<WriteError>({
              _tag: 'MissingId',
              entity,
            });
          const seen = newest.get(id);
          if (seen === undefined || entity.meta._u > seen.entity.meta._u)
            newest.set(id, { id, entity, encoded });
        }
        return yield* write([...newest.values()], extra, 10).pipe(
          Effect.mapError((cause): WriteError =>
            cause instanceof DatabaseError
              ? storageError('failed to write the Sync Replica', cause)
              : cause instanceof ESchemaError
                ? invalid(cause)
                : cause,
          ),
        );
      }),
    eachPage: (position, onPage) =>
      Effect.gen(function* () {
        let latest = position;
        let after: Entity<StoredReplicaValue> | undefined;
        while (true) {
          const page = yield* store
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
            )
            .pipe(
              Effect.mapError((cause) =>
                storageError('failed to read the Sync Replica', cause),
              ),
            );
          const entities: Entity<TItem>[] = [];
          for (const item of page.items) {
            entities.push(
              yield* decodeEntity(item.value.entity).pipe(
                Effect.mapError(invalid),
              ),
            );
            latest = item.value.seq;
          }
          if (entities.length > 0)
            yield* onPage({ entities, position: latest });
          after = page.items.at(-1);
          if (!page.hasMore || after === undefined) return latest;
        }
      }),
  };
};
