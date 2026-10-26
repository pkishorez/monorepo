import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { Effect, Schema } from 'effect';

/*
 * Where a Connection keeps itself: `connection.json` in Connect's data folder,
 * holding its id, name, Connection Key and owner. It is the Connection Key's
 * one copy on disk, so it is written 0600, through a temporary file
 * renamed over it, so a write cut short never leaves half a Connection.
 */

export const ConnectionRecord = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The Connection Key (ADR 0015): made once, never changed. */
  key: Schema.String,
  /** The User this Connection belongs to. */
  owner: Schema.Struct({ id: Schema.String, email: Schema.String }),
});
export type ConnectionRecord = typeof ConnectionRecord.Type;

const decode = Schema.decodeUnknownSync(
  Schema.fromJsonString(ConnectionRecord),
);

/** The Connection kept at `file`; null when there is none. */
export const readConnection = (file: string) =>
  Effect.sync(() =>
    existsSync(file) ? decode(readFileSync(file, 'utf8')) : null,
  );

/** Keeps `connection` at `file`, 0600, replacing whatever was there whole. */
export const writeConnection = (file: string, connection: ConnectionRecord) =>
  Effect.sync(() => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(connection, null, 2)}\n`, {
      mode: 0o600,
    });
    chmodSync(temporary, 0o600);
    renameSync(temporary, file);
  });

/** Forgets the Connection kept at `file`. */
export const removeConnection = (file: string) =>
  Effect.sync(() => rmSync(file, { force: true }));
