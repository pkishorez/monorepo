import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parse } from 'yaml';

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

const globsIn = (list: unknown): readonly string[] | undefined => {
  const globs = Array.isArray(list)
    ? list.filter((glob): glob is string => typeof glob === 'string')
    : [];
  return globs.length > 0 ? globs : undefined;
};
