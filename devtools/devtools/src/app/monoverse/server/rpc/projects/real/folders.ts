import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { Effect } from 'effect';

import {
  FolderError,
  type Folder,
  type FolderListing,
} from '../contract/index.js';

const limit = 100;

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

type Kind = Folder['kind'];

export function listFolders(
  home: string,
  input: {
    readonly path: string | null;
    readonly query: string;
    readonly hidden: boolean;
  },
) {
  return Effect.gen(function* () {
    const given = input.path ?? home;
    const path = expand(home, given);
    if (!isInsideAsWritten(home, path)) {
      return yield* new FolderError({
        reason: 'outside-home',
        path,
        message: `${path} is outside the home folder.`,
      });
    }
    const entry = yield* Effect.tryPromise({
      try: () => stat(path),
      catch: () =>
        new FolderError({
          reason: 'not-found',
          path,
          message: `${path} does not exist.`,
        }),
    });
    if (!entry.isDirectory()) {
      return yield* new FolderError({
        reason: 'not-directory',
        path,
        message: `${path} is not a folder.`,
      });
    }
    const listed = yield* Effect.tryPromise({
      try: () => subFolders(path, input.query, input.hidden),
      catch: (cause) =>
        new FolderError({
          reason: 'read',
          path,
          message: `Could not list ${path}: ${String(cause)}`,
        }),
    });
    const kept = listed.slice(0, limit);
    const [kind, folders] = yield* Effect.promise(() =>
      Promise.all([
        kindOf(path),
        Promise.all(
          kept.map(async ({ name, link }): Promise<Folder> => ({
            name,
            path: join(path, name),
            link,
            kind: await kindOf(join(path, name)),
          })),
        ),
      ]),
    );
    return {
      path,
      home,
      parent: path === home ? null : dirname(path),
      kind,
      folders,
      truncated: listed.length > limit,
    } satisfies FolderListing;
  });
}

async function subFolders(
  path: string,
  query: string,
  hidden: boolean,
): Promise<ReadonlyArray<{ readonly name: string; readonly link: boolean }>> {
  const needle = query.trim().toLowerCase();
  const entries = (await readdir(path, { withFileTypes: true })).filter(
    ({ name }) =>
      (hidden || !name.startsWith('.')) && name.toLowerCase().includes(needle),
  );
  const found = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory()) return { name: entry.name, link: false };
      if (!entry.isSymbolicLink()) return null;
      const target = await stat(join(path, entry.name)).catch(() => null);
      return target?.isDirectory() === true
        ? { name: entry.name, link: true }
        : null;
    }),
  );
  return found
    .filter((entry) => entry !== null)
    .sort((left, right) => collator.compare(left.name, right.name));
}

async function kindOf(folder: string): Promise<Kind> {
  const [workspace, manifest] = await Promise.all([
    stat(join(folder, 'pnpm-workspace.yaml')).then(
      (entry) => entry.isFile(),
      () => false,
    ),
    readFile(join(folder, 'package.json'), 'utf8').catch(() => undefined),
  ]);
  if (workspace) return 'monorepo';
  if (manifest === undefined) return null;
  try {
    const json = JSON.parse(manifest) as unknown;
    return typeof json === 'object' && json !== null && 'workspaces' in json
      ? 'monorepo'
      : 'package';
  } catch {
    return 'package';
  }
}

function expand(home: string, path: string): string {
  const trimmed = path.trim();
  if (trimmed === '' || trimmed === '~') return home;
  if (trimmed.startsWith('~/')) return join(home, trimmed.slice(2));
  return isAbsolute(trimmed) ? resolve(trimmed) : join(home, trimmed);
}

function isInsideAsWritten(home: string, path: string): boolean {
  const between = relative(home, path);
  return (
    between === '' ||
    (between !== '..' && !between.startsWith('../') && !isAbsolute(between))
  );
}
