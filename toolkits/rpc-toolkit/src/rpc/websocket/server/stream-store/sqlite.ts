import { StdTable, type DatabaseError } from '@kstackz/std-toolkit/db';
import { SQLite } from '@kstackz/std-toolkit/db/sqlite';
import {
  makeDurableObjectSQLite,
  type DurableObjectSQLiteStorage,
} from '@kstackz/std-toolkit/db/sqlite/durable-object';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';
import { Effect, Option, Schema, Stream } from 'effect';
import type { StreamStore } from './stream-store.ts';

export interface SQLiteOptions {
  /** The Durable Object's storage (`ctx.storage`, or alchemy's `state.raw.storage`). */
  readonly storage: DurableObjectSQLiteStorage;
  /** The SQL table the rows live in. @default "rpc_stream_store" */
  readonly tableName?: string;
}

const CONFIRM = 'I KNOW WHAT I AM DOING';

/** A checkpoint or connection value, boxed so "none" and a stored `null` stay apart. */
const Box = Schema.NullOr(Schema.Struct({ value: Schema.Unknown }));

// Built on first use, so a server on the attachment store never builds them.
const define = () => {
  const SocketRow = EntityESchema.make('RpcSocket', 'clientId', {
    connection: Box,
  }).build();

  /** The encoded RPC request, headers included, so replay re-runs per-call auth. */
  const Request = Schema.Struct({
    _tag: Schema.Literal('Request'),
    id: Schema.Union([Schema.String, Schema.Number]),
    tag: Schema.String,
    payload: Schema.Unknown,
    // Snapshots do not take tuples yet, so each [name, value] pair is an array.
    headers: Schema.Array(Schema.Array(Schema.String)),
    traceId: Schema.optionalKey(Schema.String),
    spanId: Schema.optionalKey(Schema.String),
    sampled: Schema.optionalKey(Schema.Boolean),
  });

  const StreamRow = EntityESchema.make('RpcStream', 'requestId', {
    clientId: Schema.String,
    request: Request,
    checkpoint: Box,
  }).build();

  const table = StdTable.make('rpc_stream_store').primary('pk', 'sk').build();
  const sockets = table
    .entity(SocketRow)
    .primary({ pk: ['clientId'] })
    .build();
  const streams = table
    .entity(StreamRow)
    .primary({ pk: ['clientId'] })
    .build();
  return { SocketRow, StreamRow, table, sockets, streams };
};
let schema: ReturnType<typeof define> | undefined;

/** The attachment only says which client the socket is. */
const decodeAttachment = Schema.decodeUnknownOption(
  Schema.Struct({ clientId: Schema.Number }),
);

const ignore =
  (tag: 'ItemAlreadyExists' | 'NoItemToUpdate') =>
  <A, R>(effect: Effect.Effect<A, DatabaseError, R>) =>
    effect.pipe(
      Effect.asVoid,
      Effect.catchIf(
        (error) => error.reason._tag === tag,
        () => Effect.void,
      ),
    );

const box = (value: unknown) => (value === undefined ? null : { value });

/**
 * A Stream Store on the Durable Object's own SQLite: the socket attachment
 * holds only the client id, and the socket's record and each open stream
 * (request and checkpoint) are rows partitioned by client id. Rows are hard
 * deleted when a stream ends or a socket closes. The SQL table is created on
 * first use.
 *
 * ```ts
 * Rpc.websocket.server(Api, handlers, {
 *   ...Rpc.websocket.fromDurableObjectState(ctx),
 *   streams: Rpc.websocket.streams.sqlite({ storage: ctx.storage }),
 * });
 * ```
 */
export const sqlite = (options: SQLiteOptions): StreamStore => {
  const { SocketRow, StreamRow, table, sockets, streams } = (schema ??=
    define());
  const database = makeDurableObjectSQLite({ storage: options.storage });
  const config = {
    database,
    tableName: options.tableName ?? table.logicalName,
  };
  const { layer } = SQLite.make(table, config);

  // `SQLite.setup` creates the table if missing and adds missing indexes; it
  // is idempotent, so running it once per activation is enough.
  let ready = false;
  const ensure = Effect.suspend(() =>
    ready
      ? Effect.void
      : SQLite.setup(table, config).pipe(
          Effect.tap(() => Effect.sync(() => (ready = true))),
        ),
  );

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    ensure.pipe(
      Effect.andThen(effect),
      Effect.provide(layer),
      Effect.orDie,
    ) as Effect.Effect<A>;

  const streamsOf = (clientId: string) =>
    Effect.gen(function* () {
      const rows = [];
      let page = yield* streams.query('primary', {
        pk: { clientId },
        '>=': null,
      });
      rows.push(...page.items);
      while (page.hasMore) {
        page = yield* streams.query(
          'primary',
          { pk: { clientId }, '>=': null },
          { after: page.items.at(-1)! },
        );
        rows.push(...page.items);
      }
      return rows;
    });

  const forget = (clientId: string) =>
    Effect.gen(function* () {
      for (const row of yield* streamsOf(clientId)) {
        yield* streams.hardDelete(
          { clientId, requestId: row.value.requestId },
          CONFIRM,
        );
      }
      yield* sockets
        .hardDelete({ clientId }, CONFIRM)
        .pipe(ignore('NoItemToUpdate'));
    });

  return {
    connect: (socket, clientId, connection) =>
      run(
        Effect.gen(function* () {
          const id = String(clientId);
          yield* forget(id);
          yield* sockets.insert({ clientId: id, connection: box(connection) });
          socket.serializeAttachment({ clientId });
        }),
      ),
    load: (socket) =>
      run(
        Effect.gen(function* () {
          const attachment = decodeAttachment(
            socket.deserializeAttachment<unknown>(),
          );
          if (Option.isNone(attachment)) return Option.none();
          const clientId = String(attachment.value.clientId);
          const record = yield* sockets.get({ clientId });
          if (record === null) return Option.none();
          const rows = yield* streamsOf(clientId);
          return Option.some({
            clientId: attachment.value.clientId,
            connection: record.value.connection?.value,
            streams: rows.map(({ value }) => ({
              request: {
                ...value.request,
                headers: value.request.headers.map(
                  ([name = '', header = '']) => [name, header] as const,
                ),
              },
              checkpoint:
                value.checkpoint === null
                  ? Option.none()
                  : Option.some(value.checkpoint.value),
            })),
          });
        }),
      ),
    start: (_socket, clientId, request) =>
      run(
        streams
          .insert({
            clientId: String(clientId),
            requestId: String(request.id),
            request,
            checkpoint: null,
          })
          .pipe(ignore('ItemAlreadyExists')),
      ),
    getCheckpoint: (_socket, clientId, requestId) =>
      run(
        streams
          .get({ clientId: String(clientId), requestId: String(requestId) })
          .pipe(
            Effect.map((row) =>
              row === null || row.value.checkpoint === null
                ? Option.none()
                : Option.some(row.value.checkpoint.value),
            ),
          ),
      ),
    putCheckpoint: (_socket, clientId, requestId, checkpoint) =>
      run(
        streams
          .getAndUpdate(
            { clientId: String(clientId), requestId: String(requestId) },
            { checkpoint: { value: checkpoint } },
            { lastWriteWins: true },
          )
          .pipe(ignore('NoItemToUpdate')),
      ),
    end: (_socket, clientId, requestId) =>
      run(
        streams
          .hardDelete(
            { clientId: String(clientId), requestId: String(requestId) },
            CONFIRM,
          )
          .pipe(ignore('NoItemToUpdate')),
      ),
    forget: (_socket, clientId) => run(forget(String(clientId))),
    reconcile: (live) =>
      run(
        Effect.gen(function* () {
          const alive = new Set([...live].map(String));
          const rows = yield* Stream.runCollect(table.scan());
          for (const { meta, data } of rows) {
            const clientId = String(data.clientId);
            if (alive.has(clientId)) continue;
            if (meta._e === SocketRow.name)
              yield* sockets
                .hardDelete({ clientId }, CONFIRM)
                .pipe(ignore('NoItemToUpdate'));
            else if (meta._e === StreamRow.name)
              yield* streams
                .hardDelete(
                  { clientId, requestId: String(data.requestId) },
                  CONFIRM,
                )
                .pipe(ignore('NoItemToUpdate'));
          }
        }),
      ),
  };
};
