import { mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { Effect, Layer } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import { SQLite, type SQLiteDriver } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import type { ProjectEntry } from '../../../rpc/projects/contract/index.js';
import {
  ProjectStore,
  ProjectStoreError,
  type ProjectStoreShape,
} from '../contract/index.js';
import {
  entries,
  table,
  tableName,
  type ProjectEntryEntitySchema,
} from './stored-entries.js';

type StoredEntry = Entity<typeof ProjectEntryEntitySchema.Type>;

const tool = 'monoverse';

const nameOf = (path: string): string => {
  try {
    const { name } = JSON.parse(
      readFileSync(join(path, 'package.json'), 'utf8'),
    ) as { name?: unknown };
    if (typeof name === 'string' && name.trim() !== '') return name;
  } catch {}
  return basename(path);
};

const entryOf = ({
  id,
  path,
  addedAt,
}: StoredEntry['value']): ProjectEntry => ({
  id,
  path,
  name: nameOf(path),
  addedAt,
});

const storeError = (operation: string, cause: unknown) =>
  new ProjectStoreError({ operation, cause: String(cause) });

export const makeSqliteProjectStore = (options: {
  readonly path: string;
  readonly driver?: SQLiteDriver | undefined;
}) =>
  Effect.gen(function* () {
    const database =
      options.driver ??
      (yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            if (options.path !== ':memory:')
              mkdirSync(dirname(options.path), { recursive: true });
            return makeNodeSQLite({ path: options.path });
          },
          catch: (cause) => storeError('open', cause),
        }),
        (driver) => Effect.sync(() => driver.close?.()),
      ));
    const configured = SQLite.make(table, { database, tableName });
    const provideSqlite = <A, E>(
      effect: Effect.Effect<A, E, Layer.Success<typeof configured.layer>>,
    ) => Effect.provide(effect, configured.layer);

    yield* SQLite.setup(table, {
      database,
      tableName,
      mode: 'persistent',
    }).pipe(Effect.mapError((cause) => storeError('setup', cause)));

    const listAll = () =>
      Effect.gen(function* () {
        const items: ProjectEntry[] = [];
        let after: StoredEntry | undefined;
        for (;;) {
          const page = yield* entries.query(
            'byTool',
            { pk: { tool }, '>': null },
            after === undefined ? undefined : { after },
          );
          items.push(...page.items.map((item) => entryOf(item.value)));
          const last = page.items.at(-1);
          if (!page.hasMore || last === undefined) break;
          after = last;
        }
        return items.sort((a, b) => b.addedAt - a.addedAt);
      });

    const shape: ProjectStoreShape = {
      list: () =>
        provideSqlite(listAll()).pipe(
          Effect.mapError((cause) => storeError('list', cause)),
        ),
      add: (path) =>
        provideSqlite(
          Effect.gen(function* () {
            const known = (yield* listAll()).find(
              (entry) => entry.path === path,
            );
            if (known !== undefined) return known;
            const item = yield* entries.insert({
              id: randomUUID(),
              tool,
              path,
              label: null,
              addedAt: Date.now(),
            });
            return entryOf(item.value);
          }),
        ).pipe(Effect.mapError((cause) => storeError('add', cause))),
      remove: (id) =>
        provideSqlite(
          Effect.gen(function* () {
            const existing = yield* entries.get({ id });
            if (existing === null) return false;
            yield* entries.hardDelete({ id }, 'I KNOW WHAT I AM DOING');
            return true;
          }),
        ).pipe(Effect.mapError((cause) => storeError('remove', cause))),
    };
    return shape;
  });

export const sqliteProjectStoreLayer = (options: { readonly path: string }) =>
  Layer.effect(ProjectStore, makeSqliteProjectStore(options));
