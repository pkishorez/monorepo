import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Cause, Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authWorker, connection, openStore } from '../../../store/index.js';
import { oneDatabase } from '../index.js';

/*
 * A data folder as ke-connect 0.0.6 left it, moved into ke-connect.db: the
 * Connection and the Auth Worker from their JSON files, and connect.db
 * copied whole, its rows unread, standing in here for the Sign-in.
 */

const folders: Array<string> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const made of folders.splice(0)) rmSync(made, { recursive: true });
});

const ada = { id: 'u-ada', email: 'ada@example.com' };
const cloud = 'https://connect.example';
const v2 = {
  id: 'c-1',
  name: 'studio',
  owner: ada,
  cloud,
  startedAt: 1,
};
/** connection.json as 0.0.6 wrote it: v2, marked so. A v1 file has no mark. */
const writtenV2 = { ...v2, _v: 'v2' };

/** A data folder with the old files, each as `files` says; `plugins/code/code.db` always. */
const oldFolder = (
  files: {
    readonly connection?: unknown;
    readonly auth?: unknown;
    readonly signIn?: string;
  } = {},
) => {
  const data = mkdtempSync(join(tmpdir(), 'connect-migrate-'));
  folders.push(data);
  mkdirSync(join(data, 'plugins', 'code'), { recursive: true });
  writeFileSync(join(data, 'plugins', 'code', 'code.db'), 'sessions');
  if (files.connection !== undefined)
    writeFileSync(
      join(data, 'connection.json'),
      typeof files.connection === 'string'
        ? files.connection
        : JSON.stringify(files.connection),
    );
  if (files.auth !== undefined)
    writeFileSync(join(data, 'auth.json'), JSON.stringify(files.auth));
  if (files.signIn !== undefined) {
    const database = new DatabaseSync(join(data, 'connect.db'));
    database.exec('CREATE TABLE probe (token TEXT)');
    database.prepare('INSERT INTO probe VALUES (?)').run(files.signIn);
    database.close();
  }
  writeFileSync(join(data, 'wanted.json'), '{"wanted":{}}');
  return data;
};

/** What ke-connect.db in `data` keeps: the Connection, the Auth Worker, and the probe row, if it came. */
const keptIn = (data: string) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = join(data, 'ke-connect.db');
        const store = yield* openStore(db);
        const kept = yield* connection.get().pipe(Effect.provide(store.table));
        const named = yield* authWorker.get().pipe(Effect.provide(store.table));
        const reading = new DatabaseSync(db, { readOnly: true });
        const probe = reading
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'probe'",
          )
          .all().length
          ? (reading.prepare('SELECT token FROM probe').get() as {
              token: string;
            })
          : null;
        reading.close();
        return {
          connection: kept.value.connection,
          authWorker: named.value.authWorker,
          signIn: probe?.token ?? null,
        };
      }),
    ),
  );

const migrate = (data: string) => Effect.runPromise(oneDatabase(data));

describe('moving a 0.0.6 data folder into ke-connect.db', () => {
  it('moves the Connection, the Auth Worker and the Sign-in, deletes the old files, and leaves the Plugins alone', async () => {
    const data = oldFolder({
      connection: writtenV2,
      auth: { cloud, url: 'https://auth.example' },
      signIn: 'token-1',
    });
    await migrate(data);
    expect(readdirSync(data).sort()).toEqual(['ke-connect.db', 'plugins']);
    expect(readdirSync(join(data, 'plugins', 'code'))).toEqual(['code.db']);
    expect(statSync(join(data, 'ke-connect.db')).mode & 0o777).toBe(0o600);
    expect(await keptIn(data)).toEqual({
      connection: v2,
      authWorker: { cloud, url: 'https://auth.example' },
      signIn: 'token-1',
    });
  });

  it('reads a v1 connection.json, from when it kept a key, and drops the key', async () => {
    const data = oldFolder({ connection: { ...v2, key: 'kept-key' } });
    await migrate(data);
    expect((await keptIn(data)).connection).toEqual(v2);
  });

  it('moves what it can read, and a file it cannot is a new Connection', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const data = oldFolder({ connection: '{ not json', signIn: 'token-1' });
    await migrate(data);
    expect(existsSync(join(data, 'connection.json'))).toBe(false);
    expect(await keptIn(data)).toEqual({
      connection: null,
      authWorker: null,
      signIn: 'token-1',
    });
  });

  it('does it all again when it stopped before ke-connect.db was whole', async () => {
    const data = oldFolder({ connection: writtenV2, signIn: 'token-1' });
    // A stop part way through left a temporary file, never ke-connect.db.
    writeFileSync(join(data, 'ke-connect.db.tmp'), 'half a database');
    await migrate(data);
    expect(readdirSync(data).sort()).toEqual(['ke-connect.db', 'plugins']);
    expect(await keptIn(data)).toMatchObject({
      connection: v2,
      signIn: 'token-1',
    });
  });

  it('only deletes the old files once ke-connect.db is whole', async () => {
    const data = oldFolder({ connection: writtenV2 });
    await migrate(data);
    // A stop after the rename left the old files behind.
    writeFileSync(
      join(data, 'connection.json'),
      JSON.stringify({ ...v2, id: 'c-other' }),
    );
    await migrate(data);
    expect(readdirSync(data).sort()).toEqual(['ke-connect.db', 'plugins']);
    expect((await keptIn(data)).connection).toEqual(v2);
  });

  it('fails, rather than dies, on a Sign-in table it cannot take', async () => {
    const data = oldFolder({ connection: writtenV2 });
    const database = new DatabaseSync(join(data, 'connect.db'));
    database.exec('CREATE TABLE "auth-device-accounts" (id TEXT PRIMARY KEY)');
    database.close();
    const exit = await Effect.runPromiseExit(oneDatabase(data));
    expect(exit._tag).toBe('Failure');
    if (exit._tag === 'Failure') expect(Cause.hasDies(exit.cause)).toBe(false);
  });

  it('does nothing to a folder with no old files', async () => {
    const data = oldFolder();
    rmSync(join(data, 'wanted.json'));
    await migrate(data);
    expect(readdirSync(data)).toEqual(['plugins']);
  });
});
