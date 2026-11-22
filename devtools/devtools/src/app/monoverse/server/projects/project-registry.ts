import { mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { Context, Data, Effect, Layer } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import { SQLite, type SQLiteDriver } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import {
  ProjectRegistryError,
  ProjectRegistryRpc,
  type ProjectEntry,
} from '../../contract/index.js';
import {
  entries,
  table,
  tableName,
  type ProjectEntryEntitySchema,
} from './stored-entries.js';

export class ProjectRegistryStoreError extends Data.TaggedError(
  'ProjectRegistryStoreError',
)<{
  operation: string;
  cause: string;
}> {}

type StoredEntry = Entity<typeof ProjectEntryEntitySchema.Type>;

export interface ProjectRegistryShape {
  /** Every Project, newest first. */
  list(): Effect.Effect<ProjectEntry[], ProjectRegistryStoreError>;
  /** Adds the folder, absolute, or answers the entry it already is. */
  add(path: string): Effect.Effect<ProjectEntry, ProjectRegistryStoreError>;
  remove(id: string): Effect.Effect<boolean, ProjectRegistryStoreError>;
}

/** The Project registry: every Monorepo and Single Package added to Monoverse. */
export class ProjectRegistry extends Context.Service<
  ProjectRegistry,
  ProjectRegistryShape
>()('devtools/ProjectRegistry') {}

// Every entry is written, and listed, under this partition of the store.
const tool = 'monoverse';

/**
 * What a Project is called: its `package.json` name, else its folder's.
 * A worktree's folder is often named after nothing a person would know.
 */
const nameOf = (path: string): string => {
  try {
    const { name } = JSON.parse(
      readFileSync(join(path, 'package.json'), 'utf8'),
    ) as { name?: unknown };
    if (typeof name === 'string' && name.trim() !== '') return name;
  } catch {
    // No readable manifest: the folder's name.
  }
  return basename(path);
};

// A stored label, from before Projects were only folders, is never read.
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
  new ProjectRegistryStoreError({ operation, cause: String(cause) });

/** Opens the Project registry on one SQLite database; other stores may share the file. */
export const makeSqliteProjectRegistry = (options: {
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

    const shape: ProjectRegistryShape = {
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

export const sqliteProjectRegistryLayer = (options: {
  readonly path: string;
}) => Layer.effect(ProjectRegistry, makeSqliteProjectRegistry(options));

const toRpcError = (cause: unknown) =>
  new ProjectRegistryError({
    reason: 'store',
    message:
      cause instanceof ProjectRegistryStoreError
        ? `${cause.operation}: ${cause.cause}`
        : String(cause),
  });

const invalidPath = (message: string) =>
  new ProjectRegistryError({ reason: 'invalid-path', message });

/**
 * The folder a Project path names: absolute (`~` expanded), existing, a
 * folder, its symbolic links resolved so one folder is one Project.
 */
function projectFolder(path: string) {
  return Effect.gen(function* () {
    const trimmed = path.trim();
    const expanded =
      trimmed === '~'
        ? homedir()
        : trimmed.startsWith('~/')
          ? join(homedir(), trimmed.slice(2))
          : trimmed;
    if (!isAbsolute(expanded)) {
      return yield* invalidPath('A Project path must be absolute.');
    }
    const folder = yield* Effect.tryPromise({
      try: () => realpath(resolve(expanded)),
      catch: () => invalidPath(`${expanded} does not exist.`),
    });
    const entry = yield* Effect.tryPromise({
      try: () => stat(folder),
      catch: () => invalidPath(`${expanded} does not exist.`),
    });
    if (!entry.isDirectory()) {
      return yield* invalidPath(`${expanded} is not a folder.`);
    }
    return folder;
  });
}

/** Fulfils the Project registry RPC contract with the registry. */
export const ProjectRegistryRpcLive = ProjectRegistryRpc.toLayer({
  ListProjects: () =>
    Effect.flatMap(ProjectRegistry, (registry) => registry.list()).pipe(
      Effect.mapError(toRpcError),
    ),
  AddProject: ({ path }) =>
    Effect.gen(function* () {
      const registry = yield* ProjectRegistry;
      const folder = yield* projectFolder(path);
      return yield* registry.add(folder).pipe(Effect.mapError(toRpcError));
    }),
  RemoveProject: ({ id }) =>
    Effect.flatMap(ProjectRegistry, (registry) => registry.remove(id)).pipe(
      Effect.map((removed) => ({ removed })),
      Effect.mapError(toRpcError),
    ),
});
