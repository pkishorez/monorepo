import { DatabaseSync } from 'node:sqlite';
import type { DurableObjectSQLiteStorage } from '@kstackz/std-toolkit/db/sqlite/durable-object';
import { Effect } from 'effect';
import { HttpServerRequest } from 'effect/http';
import { Rpc } from '../rpc/index.ts';

/** A stand-in for a Durable Object's `storage`, over an in-memory node:sqlite. */
export const durableObjectStorage = () => {
  const database = new DatabaseSync(':memory:');
  const storage: DurableObjectSQLiteStorage = {
    sql: {
      exec: (sql, ...parameters) => {
        const statement = database.prepare(sql);
        const rows =
          statement.columns().length > 0
            ? statement.all(...parameters)
            : (statement.run(...parameters), []);
        return { toArray: () => rows as never, rowsWritten: 0 };
      },
    },
    transactionSync: (callback) => {
      database.exec('BEGIN');
      try {
        const result = callback();
        database.exec('COMMIT');
        return result;
      } catch (cause) {
        database.exec('ROLLBACK');
        throw cause;
      }
    },
  };
  return { storage, database };
};

/** A hibernatable socket double: its attachment, what it was sent, and how it was closed. */
export function socket(seed: unknown = null) {
  let attachment = structuredClone(seed);
  const sent: string[] = [];
  const closed: Array<{ code: number; reason: string }> = [];
  const ws = { send: (data: string) => sent.push(data), close: () => {} };
  const port: Rpc.HibernatingSocket = {
    ws: ws as unknown as Rpc.HibernatingSocket['ws'],
    close: (code, reason) =>
      Effect.sync(() => void closed.push({ code, reason })),
    serializeAttachment: (value) => {
      attachment = structuredClone(value);
    },
    deserializeAttachment: <T>() => attachment as T | null,
  };
  return {
    port,
    sent,
    closed,
    /** The socket as it survives hibernation: a fresh object with the same attachment. */
    hibernate: () => socket(attachment),
  };
}
export type TestSocket = ReturnType<typeof socket>;

/** Each Stream Store under test, built fresh per test; `store()` is called once per boot. */
export const stores = [
  {
    name: 'attachment',
    make: () => ({
      store: () => Rpc.websocket.streams.attachment(),
      rows: () => undefined as number | undefined,
    }),
  },
  {
    name: 'sqlite',
    make: () => {
      const { storage, database } = durableObjectStorage();
      return {
        store: () => Rpc.websocket.streams.sqlite({ storage }),
        /** Physical rows in the table, so a soft delete would still be counted. */
        rows: () =>
          Number(
            (
              database
                .prepare('SELECT count(*) AS n FROM rpc_stream_store')
                .get() as { n: number }
            ).n,
          ),
      };
    },
  },
] as const;

export const accept = <E>(server: {
  readonly accept: Effect.Effect<
    unknown,
    E,
    HttpServerRequest.HttpServerRequest
  >;
}) =>
  Effect.runPromise(
    server.accept.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(new Request('https://test/rpc')),
      ),
    ),
  );

export const watch = (id: string, headers: Array<[string, string]> = []) =>
  JSON.stringify({ _tag: 'Request', id, tag: 'watch', payload: null, headers });
