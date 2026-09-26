import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { Context, Data, Effect, Layer } from 'effect';
import type { Entity } from 'std-toolkit/core';
import { StdTable } from 'std-toolkit/db';
import { SQLite, type SQLiteDriver } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import {
  ProjectEntryEntitySchema,
  ProjectRegistryError,
  ProjectRegistryRpc,
  type ProjectEntry,
  type ProjectEntryRecord,
  type RegistryTool,
} from '../../rpc/index.js';
import { resolveWorktrees } from '../resolve-worktrees/index.js';

export class ProjectRegistryStoreError extends Data.TaggedError(
  'ProjectRegistryStoreError',
)<{
  operation: string;
  cause: string;
}> {}

type Entry = Entity<ProjectEntryRecord>['value'];

export interface ProjectRegistryShape {
  list(tool: RegistryTool): Effect.Effect<Entry[], ProjectRegistryStoreError>;
  add(input: {
    tool: RegistryTool;
    path: string;
    label: string | null;
  }): Effect.Effect<Entry, ProjectRegistryStoreError>;
  update(
    id: string,
    patch: { path: string; label: string | null },
  ): Effect.Effect<Entry | null, ProjectRegistryStoreError>;
  remove(id: string): Effect.Effect<boolean, ProjectRegistryStoreError>;
}

/** The Project registry: every Project a developer registered, per Tool. */
export class ProjectRegistry extends Context.Service<
  ProjectRegistry,
  ProjectRegistryShape
>()('devtools/ProjectRegistry') {}

const table = StdTable.make('project-registry')
  .primary('pk', 'sk')
  .gsi('tool', 'toolPk', 'toolSk')
  .build();

const entries = table
  .entity(ProjectEntryEntitySchema)
  .primary()
  .index('tool', 'byTool', { pk: ['tool'] })
  .build();

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
    const configured = SQLite.make(table, {
      database,
      tableName: 'project_registry_data',
    });
    const provideSqlite = <A, E>(
      effect: Effect.Effect<A, E, Layer.Success<typeof configured.layer>>,
    ) => Effect.provide(effect, configured.layer);

    yield* SQLite.setup(table, {
      database,
      tableName: 'project_registry_data',
    }).pipe(Effect.mapError((cause) => storeError('setup', cause)));

    const listAll = (tool: RegistryTool) =>
      Effect.gen(function* () {
        const items: Entry[] = [];
        let after: Entity<ProjectEntryRecord> | undefined;
        for (;;) {
          const page = yield* entries.query(
            'byTool',
            { pk: { tool }, '>': null },
            after === undefined ? undefined : { after },
          );
          items.push(...page.items.map((item) => item.value));
          const last = page.items.at(-1);
          if (!page.hasMore || last === undefined) break;
          after = last;
        }
        return items.sort((a, b) => a.addedAt - b.addedAt);
      });

    const shape: ProjectRegistryShape = {
      list: (tool) =>
        provideSqlite(listAll(tool)).pipe(
          Effect.mapError((cause) => storeError('list', cause)),
        ),
      add: ({ tool, path, label }) =>
        provideSqlite(
          entries.insert({
            id: randomUUID(),
            tool,
            path,
            label,
            addedAt: Date.now(),
          }),
        ).pipe(
          Effect.map((item) => item.value),
          Effect.mapError((cause) => storeError('add', cause)),
        ),
      update: (id, patch) =>
        provideSqlite(
          Effect.gen(function* () {
            const existing = yield* entries.get({ id });
            if (existing === null) return null;
            const updated = yield* entries.getAndUpdate({ id }, patch);
            return updated.value;
          }),
        ).pipe(Effect.mapError((cause) => storeError('update', cause))),
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

const notFound = (id: string) =>
  new ProjectRegistryError({
    reason: 'not-found',
    message: `No registered Project has id ${id}.`,
  });

/** Registry paths must be absolute; `~` is expanded. Existence is not required. */
function normalizePath(path: string) {
  const trimmed = path.trim();
  const expanded =
    trimmed === '~'
      ? homedir()
      : trimmed.startsWith('~/')
        ? join(homedir(), trimmed.slice(2))
        : trimmed;
  if (!isAbsolute(expanded)) {
    return Effect.fail(
      new ProjectRegistryError({
        reason: 'invalid-path',
        message: 'A Project path must be absolute.',
      }),
    );
  }
  return Effect.succeed(resolve(expanded));
}

const decorate = (entry: Entry): Effect.Effect<ProjectEntry> =>
  Effect.map(resolveWorktrees(entry.path), (worktrees) => ({
    ...entry,
    worktrees,
  }));

/** Fulfils the Project registry RPC contract with the registry and the Worktree resolver. */
export const ProjectRegistryRpcLive = ProjectRegistryRpc.toLayer({
  ListProjects: ({ tool }) =>
    Effect.flatMap(ProjectRegistry, (registry) => registry.list(tool)).pipe(
      Effect.flatMap((items) =>
        Effect.forEach(items, decorate, { concurrency: 4 }),
      ),
      Effect.mapError(toRpcError),
    ),
  AddProject: ({ tool, path, label }) =>
    Effect.gen(function* () {
      const registry = yield* ProjectRegistry;
      const normalized = yield* normalizePath(path);
      const entry = yield* registry
        .add({ tool, path: normalized, label: emptyToNull(label) })
        .pipe(Effect.mapError(toRpcError));
      return yield* decorate(entry);
    }),
  UpdateProject: ({ id, path, label }) =>
    Effect.gen(function* () {
      const registry = yield* ProjectRegistry;
      const normalized = yield* normalizePath(path);
      const entry = yield* registry
        .update(id, { path: normalized, label: emptyToNull(label) })
        .pipe(Effect.mapError(toRpcError));
      if (entry === null) return yield* notFound(id);
      return yield* decorate(entry);
    }),
  RemoveProject: ({ id }) =>
    Effect.flatMap(ProjectRegistry, (registry) => registry.remove(id)).pipe(
      Effect.map((removed) => ({ removed })),
      Effect.mapError(toRpcError),
    ),
  ResolveWorktrees: ({ path }) => resolveWorktrees(path),
});

function emptyToNull(label: string | null) {
  const trimmed = label?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}
