import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect, Layer } from 'effect';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { ProjectRegistryRpc } from '../../../contract/index.js';
import {
  makeSqliteProjectRegistry,
  ProjectRegistry,
  ProjectRegistryRpcLive,
} from '../index.js';
import { entries, table, tableName } from '../stored-entries.js';

let folder: string;
beforeEach(async () => {
  folder = await realpath(await mkdtemp(join(tmpdir(), 'monoverse-projects-')));
  await mkdir(join(folder, 'alpha'));
  await mkdir(join(folder, 'beta'));
  await writeFile(join(folder, 'file.txt'), '');
  await symlink(join(folder, 'alpha'), join(folder, 'alpha-link'));
});
afterEach(() => rm(folder, { recursive: true, force: true }));

describe('the Project registry', () => {
  test('adds, lists newest first, and removes Projects', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const registry = yield* makeSqliteProjectRegistry({
            path: ':memory:',
          });
          const alpha = yield* registry.add(join(folder, 'alpha'));
          yield* Effect.sleep('2 millis');
          const beta = yield* registry.add(join(folder, 'beta'));
          expect(alpha).toEqual({
            id: alpha.id,
            path: join(folder, 'alpha'),
            name: 'alpha',
            addedAt: alpha.addedAt,
          });
          expect((yield* registry.list()).map((e) => e.name)).toEqual([
            'beta',
            'alpha',
          ]);
          // The same folder again is the entry it already is.
          expect(yield* registry.add(join(folder, 'alpha'))).toEqual(alpha);
          expect(yield* registry.list()).toHaveLength(2);

          expect(yield* registry.remove(beta.id)).toBe(true);
          expect(yield* registry.remove(beta.id)).toBe(false);
          expect((yield* registry.list()).map((e) => e.name)).toEqual([
            'alpha',
          ]);
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
          const store = SQLite.make(table, { database, tableName }).layer;
          yield* entries
            .insert({
              id: 'old',
              tool: 'laymos',
              path: '/tmp/old',
              label: null,
              addedAt: 1,
            })
            .pipe(Effect.provide(store));
          yield* entries
            .insert({
              id: 'labelled',
              tool: 'monoverse',
              path: '/tmp/labelled',
              label: 'My label',
              addedAt: 2,
            })
            .pipe(Effect.provide(store));

          const registry = yield* makeSqliteProjectRegistry({
            path: ':memory:',
            driver: database,
          });
          expect(yield* registry.list()).toEqual([
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

  test('AddProject takes an absolute folder that exists, its links resolved', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const registry = yield* makeSqliteProjectRegistry({
            path: ':memory:',
          });
          const rpc = yield* ProjectRegistryRpc.accessHandler(
            'AddProject',
          ).pipe(
            Effect.provide(
              ProjectRegistryRpcLive.pipe(
                Layer.provide(Layer.succeed(ProjectRegistry, registry)),
              ),
            ),
          );
          const add = (path: string) =>
            rpc({ path }, {} as never).pipe(
              Effect.provideService(ProjectRegistry, registry),
            );
          const linked = yield* add(join(folder, 'alpha-link'));
          expect(linked.path).toBe(join(folder, 'alpha'));
          for (const [path, message] of [
            ['relative/path', 'absolute'],
            [join(folder, 'missing'), 'does not exist'],
            [join(folder, 'file.txt'), 'not a folder'],
          ] as const) {
            const error = yield* add(path).pipe(Effect.flip);
            expect(error).toMatchObject({
              _tag: 'ProjectRegistryError',
              reason: 'invalid-path',
            });
            expect(error.message).toContain(message);
          }
        }),
      ),
    ));
});
