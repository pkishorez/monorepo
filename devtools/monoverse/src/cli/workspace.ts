import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parse } from 'yaml';

/*
 * The workspace packages of a repository, as pnpm, npm, yarn and bun
 * name them: the `packages` of pnpm-workspace.yaml, else the
 * `workspaces` of the root package.json. A folder with a package.json
 * that no glob names, such as a test fixture, is not one. When neither
 * names any, every package is.
 */

/** Whether a package folder, relative to `root`, is one of its workspace packages. */
export const workspaceOf = (root: string): ((pkg: string) => boolean) => {
  const globs = pnpmGlobs(root) ?? npmGlobs(root);
  if (globs === undefined) return () => true;
  const exclude = globs.filter((glob) => glob.startsWith('!'));
  const include = globs.filter((glob) => !glob.startsWith('!'));
  const clean = (glob: string) =>
    glob
      .replace(/^!/, '')
      .replace(/^(\.\/)+/, '')
      .replace(/\/+$/, '');
  return (pkg) =>
    include.some((glob) => posix.matchesGlob(pkg, clean(glob))) &&
    !exclude.some((glob) => posix.matchesGlob(pkg, clean(glob)));
};

const read = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
};

/** The `packages` of pnpm-workspace.yaml, in any YAML style. */
const pnpmGlobs = (root: string): readonly string[] | undefined => {
  const text = read(join(root, 'pnpm-workspace.yaml'));
  if (text === undefined) return undefined;
  let document: unknown;
  try {
    document = parse(text);
  } catch {
    return undefined;
  }
  return globsIn((document as { packages?: unknown } | null)?.packages);
};

/** The `workspaces` of the root package.json: a list, or yarn's `{ packages }`. */
const npmGlobs = (root: string): readonly string[] | undefined => {
  const text = read(join(root, 'package.json'));
  if (text === undefined) return undefined;
  let workspaces: unknown;
  try {
    workspaces = (JSON.parse(text) as { workspaces?: unknown }).workspaces;
  } catch {
    return undefined;
  }
  return globsIn(
    Array.isArray(workspaces)
      ? workspaces
      : (workspaces as { packages?: unknown } | null | undefined)?.packages,
  );
};

/**
 * The globs a list holds. Anything that names none is `undefined`, so
 * every package is checked: a workspace file read wrong never turns the
 * check off.
 */
const globsIn = (list: unknown): readonly string[] | undefined => {
  const globs = Array.isArray(list)
    ? list.filter((glob): glob is string => typeof glob === 'string')
    : [];
  return globs.length > 0 ? globs : undefined;
};
