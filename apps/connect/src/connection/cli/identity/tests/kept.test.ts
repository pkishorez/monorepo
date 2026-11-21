import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Effect } from 'effect';
import { afterEach, expect, it } from 'vitest';
import { claim } from '../connection.js';
import { kept } from '../identity.js';
import { openStore } from '../store/index.js';

const folders: Array<string> = [];
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true });
});

const tables = (db: string) => {
  const reading = new DatabaseSync(db, { readOnly: true });
  const names = reading
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name);
  reading.close();
  return names;
};

// `list` reads a Connection while its `serve` may hold the same file, so
// reading it never sets it up: a Sign-in table it would remake stays as it is.
it('reads the Connection kept without setting up ke-connect.db', async () => {
  const made = mkdtempSync(join(tmpdir(), 'connect-kept-'));
  folders.push(made);
  const db = join(made, 'ke-connect.db');
  const connection = await Effect.runPromise(
    Effect.scoped(
      Effect.flatMap(openStore(db), (store) =>
        claim(store, {
          owner: { id: 'u-ada', email: 'ada@example.com' },
          cloud: 'https://connect.example',
          startedAt: 1,
        }),
      ),
    ),
  );
  const writing = new DatabaseSync(db);
  writing.exec('DROP TABLE "auth-device-accounts"');
  writing.close();
  const before = tables(db);

  expect(await Effect.runPromise(kept(db))).toMatchObject(connection);
  expect(tables(db)).toEqual(before);
});
