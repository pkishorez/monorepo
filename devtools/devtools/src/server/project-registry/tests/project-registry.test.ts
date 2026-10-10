import { Effect } from 'effect';
import { SQLite } from '@kstackz/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kstackz/std-toolkit/db/sqlite/node';
import { describe, expect, test } from 'vitest';

import { makeSqliteProjectRegistry } from '../index.js';
import { entries, table, tableName } from '../stored-entries.js';

describe('ProjectRegistry', () => {
  test('adds, lists, updates, and removes entries', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const registry = yield* makeSqliteProjectRegistry({
            path: ':memory:',
          });
          const a = yield* registry.add({ path: '/tmp/a', label: null });
          yield* registry.add({ path: '/tmp/b', label: 'B' });

          expect((yield* registry.list()).map((e) => e.path)).toEqual([
            '/tmp/a',
            '/tmp/b',
          ]);
          expect(a).not.toHaveProperty('tool');

          const updated = yield* registry.update(a.id, {
            path: '/tmp/a2',
            label: 'A',
          });
          expect(updated).toMatchObject({ path: '/tmp/a2', label: 'A' });
          expect(
            yield* registry.update('missing', { path: '/x', label: null }),
          ).toBeNull();

          expect(yield* registry.remove(a.id)).toBe(true);
          expect(yield* registry.remove(a.id)).toBe(false);
          expect((yield* registry.list()).map((e) => e.label)).toEqual(['B']);
        }),
      ),
    );
  });

  test('never lists an entry kept for the retired Laymos Tool', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* SQLite.setup(table, { database, tableName });
          yield* entries
            .insert({
              id: 'old',
              tool: 'laymos',
              path: '/tmp/old',
              label: null,
              addedAt: 1,
            })
            .pipe(
              Effect.provide(SQLite.make(table, { database, tableName }).layer),
            );

          const registry = yield* makeSqliteProjectRegistry({
            path: ':memory:',
            driver: database,
          });
          yield* registry.add({ path: '/tmp/new', label: null });
          expect((yield* registry.list()).map((e) => e.path)).toEqual([
            '/tmp/new',
          ]);
        }),
      ),
    );
  });
});
