import { posix } from 'node:path';

import { readText, type Snapshot } from '../snapshot/index.js';

/*
 * Resolves an import as TypeScript does, against the files of a snapshot
 * rather than the disk, so a branch read from git resolves as its own
 * files say: relative paths, `.js` written for `.ts`, folder `index`
 * files, the `imports` of the nearest package.json (`#name`), and the
 * `paths` and `baseUrl` of the nearest tsconfig.json and those it
 * extends. Another Package imported by name is never followed: it is not
 * a file of this one.
 */

export const sourceExtensions = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
];

const extensionAlias: Readonly<Record<string, ReadonlyArray<string>>> = {
  '.js': ['.ts', '.tsx', '.js'],
  '.jsx': ['.tsx', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
};

/** The conditions an `imports` target is read under, as TypeScript reads it. */
const conditions = new Set(['types', 'import', 'module', 'node', 'default']);

/** Resolves imports among `files`, root-relative. */
export interface Resolver {
  /** The file `specifier`, written in `from`, names; undefined when none of `files`. */
  readonly resolve: (
    from: string,
    specifier: string,
  ) => Promise<string | undefined>;
}

type Paths = {
  readonly patterns: Readonly<Record<string, ReadonlyArray<string>>>;
  /** The folder `paths` targets are relative to. */
  readonly base: string;
};

type Tsconfig = { readonly baseUrl?: string; readonly paths?: Paths };

export function createResolver(
  snapshot: Snapshot,
  files: ReadonlySet<string>,
): Resolver {
  const json = new Map<string, Promise<unknown>>();
  const readJson = (path: string): Promise<unknown> => {
    let kept = json.get(path);
    if (kept === undefined) {
      kept = readText(snapshot, path).then(
        (text) => (text === undefined ? undefined : parseJsonc(text)),
        () => undefined,
      );
      json.set(path, kept);
    }
    return kept;
  };

  /** The nearest `name` at or above `folder` that `read` finds, and its folder. */
  const nearest = async <A>(
    folder: string,
    read: (folder: string) => Promise<A | undefined>,
  ): Promise<A | undefined> => {
    let at: string | null = folder;
    while (at !== null) {
      const found = await read(at);
      if (found !== undefined) return found;
      at = at === '' ? null : parentOf(at);
    }
    return undefined;
  };

  const tsconfigs = new Map<string, Promise<Tsconfig | undefined>>();
  const loadTsconfig = (
    path: string,
    seen: ReadonlySet<string> = new Set(),
  ): Promise<Tsconfig | undefined> => {
    let kept = tsconfigs.get(path);
    if (kept === undefined) {
      kept = readTsconfig(path, seen);
      tsconfigs.set(path, kept);
    }
    return kept;
  };
  const readTsconfig = async (
    path: string,
    seen: ReadonlySet<string>,
  ): Promise<Tsconfig | undefined> => {
    const config = await readJson(path);
    if (!isRecord(config)) return undefined;
    const folder = parentOf(path);
    let inherited: Tsconfig = {};
    const extended =
      typeof config.extends === 'string'
        ? [config.extends]
        : Array.isArray(config.extends)
          ? config.extends.filter((entry) => typeof entry === 'string')
          : [];
    for (const entry of extended) {
      // Only a config inside the Project: a package's is not one of its files.
      if (!entry.startsWith('.')) continue;
      const target = joinInside(
        folder,
        entry.endsWith('.json') ? entry : `${entry}.json`,
      );
      if (target === undefined || seen.has(target)) continue;
      const base = await loadTsconfig(target, new Set([...seen, path]));
      if (base !== undefined) inherited = { ...inherited, ...base };
    }
    const options = isRecord(config.compilerOptions)
      ? config.compilerOptions
      : {};
    const baseUrl =
      typeof options.baseUrl === 'string'
        ? joinInside(folder, options.baseUrl)
        : inherited.baseUrl;
    const paths = isRecord(options.paths)
      ? { patterns: stringLists(options.paths), base: folder }
      : inherited.paths;
    return {
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(paths === undefined ? {} : { paths }),
    };
  };

  /** The first of `bases`' candidates that is one of `files`. */
  const pick = (bases: ReadonlyArray<string | undefined>) => {
    for (const base of bases) {
      if (base === undefined) continue;
      for (const candidate of candidatesOf(base)) {
        if (files.has(candidate)) return candidate;
      }
    }
    return undefined;
  };

  const resolveImports = async (from: string, specifier: string) => {
    const found = await nearest(parentOf(from), async (folder) => {
      const manifest = await readJson(joinPath(folder, 'package.json'));
      return isRecord(manifest) ? { folder, manifest } : undefined;
    });
    if (found === undefined || !isRecord(found.manifest.imports))
      return undefined;
    const targets = matchPattern(found.manifest.imports, specifier);
    return pick(
      targets.map((target) =>
        target.startsWith('./') ? joinInside(found.folder, target) : undefined,
      ),
    );
  };

  const resolveBare = async (from: string, specifier: string) => {
    const config = await nearest(parentOf(from), (folder) =>
      loadTsconfig(joinPath(folder, 'tsconfig.json')),
    );
    if (config === undefined) return undefined;
    const { paths, baseUrl } = config;
    if (paths !== undefined) {
      const targets = matchPattern(paths.patterns, specifier);
      const base = baseUrl ?? paths.base;
      const found = pick(targets.map((target) => joinInside(base, target)));
      if (found !== undefined) return found;
    }
    return baseUrl === undefined
      ? undefined
      : pick([joinInside(baseUrl, specifier)]);
  };

  return {
    resolve: async (from, specifier) => {
      if (
        specifier === '.' ||
        specifier === '..' ||
        specifier.startsWith('./') ||
        specifier.startsWith('../')
      ) {
        return pick([joinInside(parentOf(from), specifier)]);
      }
      if (specifier.startsWith('/') || specifier.startsWith('node:'))
        return undefined;
      if (specifier.startsWith('#')) return resolveImports(from, specifier);
      return resolveBare(from, specifier);
    },
  };
}

/** The files a written path may name, most likely first. */
function candidatesOf(base: string): ReadonlyArray<string> {
  const extension = posix.extname(base);
  const aliased = extensionAlias[extension];
  const stem = base.slice(0, base.length - extension.length);
  return [
    ...(aliased === undefined ? [] : aliased.map((alias) => stem + alias)),
    base,
    ...sourceExtensions.map((ext) => base + ext),
    ...sourceExtensions.map((ext) => `${base}/index${ext}`),
  ];
}

/**
 * The targets of the key matching `specifier`: an exact key, else the
 * pattern with one `*` and the longest prefix, its `*` filled in.
 */
function matchPattern(
  map: Readonly<Record<string, unknown>>,
  specifier: string,
): ReadonlyArray<string> {
  if (specifier in map) return targetsOf(map[specifier], '');
  let best: { key: string; star: string } | undefined;
  for (const key of Object.keys(map)) {
    const star = key.indexOf('*');
    if (star === -1 || key.indexOf('*', star + 1) !== -1) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (
      specifier.length >= prefix.length + suffix.length &&
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix) &&
      (best === undefined || prefix.length > best.key.indexOf('*'))
    ) {
      best = {
        key,
        star: specifier.slice(prefix.length, specifier.length - suffix.length),
      };
    }
  }
  return best === undefined ? [] : targetsOf(map[best.key], best.star);
}

/** A target as written: a path, a list of them, or conditions holding them. */
function targetsOf(target: unknown, star: string): ReadonlyArray<string> {
  if (typeof target === 'string') return [target.replaceAll('*', star)];
  if (Array.isArray(target))
    return target.flatMap((entry) => targetsOf(entry, star));
  if (isRecord(target)) {
    for (const [condition, value] of Object.entries(target)) {
      if (!conditions.has(condition)) continue;
      const found = targetsOf(value, star);
      if (found.length > 0) return found;
    }
  }
  return [];
}

function stringLists(
  record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, ReadonlyArray<string>>> {
  const lists: Record<string, ReadonlyArray<string>> = {};
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value))
      lists[key] = value.filter((entry) => typeof entry === 'string');
  }
  return lists;
}

/** `path` from `folder`, root-relative; undefined when it leaves the root. */
function joinInside(folder: string, path: string): string | undefined {
  const joined = posix.normalize(posix.join(folder, path));
  if (joined === '..' || joined.startsWith('../') || joined.startsWith('/'))
    return undefined;
  return joined === '.' ? '' : joined.replace(/\/$/, '');
}

function joinPath(folder: string, path: string): string {
  return folder === '' ? path : `${folder}/${path}`;
}

function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON with the comments and trailing commas tsconfig.json allows. */
export function parseJsonc(text: string): unknown {
  let plain = '';
  let index = 0;
  while (index < text.length) {
    const char = text[index]!;
    if (char === '"') {
      const start = index;
      index += 1;
      while (index < text.length && text[index] !== '"') {
        index += text[index] === '\\' ? 2 : 1;
      }
      index += 1;
      plain += text.slice(start, index);
    } else if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1;
    } else if (char === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      index = end === -1 ? text.length : end + 2;
    } else {
      plain += char;
      index += 1;
    }
  }
  try {
    return JSON.parse(plain.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return undefined;
  }
}
