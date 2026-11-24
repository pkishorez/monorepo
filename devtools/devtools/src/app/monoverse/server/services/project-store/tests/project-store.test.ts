import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { makeSqliteProjectStore } from '../real/project-store.js';
import { entries, table, tableName } from '../real/stored-entries.js';

let folder: string;
beforeEach(async () => {
  folder = await realpath(await mkdtemp(join(tmpdir(), 'monoverse-projects-')));
  await mkdir(join(folder, 'alpha'));
  await mkdir(join(folder, 'beta'));
});
afterEach(() => rm(folder, { recursive: true, force: true }));

describe('the Project store', () => {
  test('adds, lists newest first, and removes Projects', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeSqliteProjectStore({
            path: ':memory:',
          });
          const alpha = yield* store.add(join(folder, 'alpha'));
          yield* Effect.sleep('2 millis');
          const beta = yield* store.add(join(folder, 'beta'));
          expect(alpha).toEqual({
            id: alpha.id,
            path: join(folder, 'alpha'),
            name: 'alpha',
            addedAt: alpha.addedAt,
          });
          expect((yield* store.list()).map((e) => e.name)).toEqual([
            'beta',
            'alpha',
          ]);
          // The same folder again is the entry it already is.
          expect(yield* store.add(join(folder, 'alpha'))).toEqual(alpha);
          expect(yield* store.list()).toHaveLength(2);

          expect(yield* store.remove(beta.id)).toBe(true);
          expect(yield* store.remove(beta.id)).toBe(false);
          expect((yield* store.list()).map((e) => e.name)).toEqual(['alpha']);
        }),
      ),
    ));

  test('reads rows kept with a label, and never lists one kept for the retired Laymos Tool', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* SQLite.setup(table, {
            database,
            tableName,
            mode: 'persistent',
          });
          const sqlite = SQLite.make(table, { database, tableName }).layer;
          yield* entries
            .insert({
              id: 'old',
              tool: 'laymos',
              path: '/tmp/old',
              label: null,
              addedAt: 1,
            })
            .pipe(Effect.provide(sqlite));
          yield* entries
            .insert({
              id: 'labelled',
              tool: 'monoverse',
              path: '/tmp/labelled',
              label: 'My label',
              addedAt: 2,
            })
            .pipe(Effect.provide(sqlite));

          const store = yield* makeSqliteProjectStore({
            path: ':memory:',
            driver: database,
          });
          expect(yield* store.list()).toEqual([
            {
              id: 'labelled',
              path: '/tmp/labelled',
              name: 'labelled',
              addedAt: 2,
            },
          ]);
        }),
      ),
    );
  });
});
