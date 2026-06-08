import { Effect } from 'effect';
import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DiscoverError } from '../discover/index.js';

/** A monorepo package that exposes a `vtest/` documentation folder. */
export interface PackageRef {
  readonly name: string;
  readonly dir: string;
}

const isMissing = (cause: unknown): boolean =>
  typeof cause === 'object' &&
  cause !== null &&
  (cause as { code?: string }).code === 'ENOENT';

const readDirOptional = (
  dir: string,
): Effect.Effect<ReadonlyArray<Dirent>, DiscoverError> =>
  Effect.tryPromise({
    try: () => fs.readdir(dir, { withFileTypes: true }),
    catch: (cause) => new DiscoverError(dir, cause),
  }).pipe(
    Effect.catch((error) =>
      isMissing(error.reason)
        ? Effect.succeed([] as ReadonlyArray<Dirent>)
        : Effect.fail(error),
    ),
  );

const hasVtestFolder = (dir: string): Effect.Effect<boolean, DiscoverError> =>
  Effect.tryPromise({
    try: () => fs.stat(path.join(dir, 'vtest')),
    catch: (cause) => new DiscoverError(dir, cause),
  }).pipe(
    Effect.map((stat) => stat.isDirectory()),
    Effect.catch((error) =>
      isMissing(error.reason) ? Effect.succeed(false) : Effect.fail(error),
    ),
  );

const readName = (pkgDir: string): Effect.Effect<string, DiscoverError> =>
  Effect.tryPromise({
    try: () => fs.readFile(path.join(pkgDir, 'package.json'), 'utf8'),
    catch: (cause) => new DiscoverError(pkgDir, cause),
  }).pipe(
    Effect.map((raw) => {
      try {
        const name = (JSON.parse(raw) as { name?: string }).name;
        return name ?? path.basename(pkgDir);
      } catch {
        return path.basename(pkgDir);
      }
    }),
    Effect.catch((error) =>
      isMissing(error.reason)
        ? Effect.succeed(path.basename(pkgDir))
        : Effect.fail(error),
    ),
  );

const readFileOptional = (
  file: string,
): Effect.Effect<string | null, DiscoverError> =>
  Effect.tryPromise({
    try: () => fs.readFile(file, 'utf8'),
    catch: (cause) => new DiscoverError(file, cause),
  }).pipe(
    Effect.catch((error) =>
      isMissing(error.reason) ? Effect.succeed(null) : Effect.fail(error),
    ),
  );

/**
 * The package globs declared in `pnpm-workspace.yaml`. Each `- <glob>` entry
 * under the `packages:` key is returned verbatim (e.g. `packages/*`). Falls
 * back to `['packages/*']` when no workspace file is present.
 */
const workspaceGlobs = (
  repoRoot: string,
): Effect.Effect<ReadonlyArray<string>, DiscoverError> =>
  Effect.gen(function* () {
    const raw = yield* readFileOptional(
      path.join(repoRoot, 'pnpm-workspace.yaml'),
    );
    if (raw === null) return ['packages/*'];
    const globs: Array<string> = [];
    let inPackages = false;
    for (const line of raw.split('\n')) {
      if (/^packages:\s*$/.test(line)) {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        const item = /^\s+-\s+['"]?([^'"#]+?)['"]?\s*$/.exec(line);
        if (item) {
          globs.push(item[1]!.trim());
          continue;
        }
        // A non-indented, non-list line ends the packages block.
        if (/^\S/.test(line)) break;
      }
    }
    return globs.length > 0 ? globs : ['packages/*'];
  });

/**
 * Expand a single workspace glob into candidate package directories. Supports
 * the two forms pnpm workspaces use in practice: a `<dir>/*` wildcard (scan the
 * dir's immediate children) and a literal directory path.
 */
const expandGlob = (
  repoRoot: string,
  glob: string,
): Effect.Effect<ReadonlyArray<string>, DiscoverError> =>
  Effect.gen(function* () {
    if (glob.endsWith('/*')) {
      const parent = path.join(repoRoot, glob.slice(0, -2));
      const entries = yield* readDirOptional(parent);
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => path.join(parent, e.name));
    }
    return [path.join(repoRoot, glob)];
  });

/**
 * Scan every workspace package (per `pnpm-workspace.yaml`) for those exposing a
 * `vtest/` folder, returning each package's name (from its `package.json`) and
 * absolute dir. Pure filesystem; runs no tests.
 */
export const discoverPackages = (
  repoRoot: string,
): Effect.Effect<ReadonlyArray<PackageRef>, DiscoverError> =>
  Effect.gen(function* () {
    const globs = yield* workspaceGlobs(repoRoot);
    const expanded = yield* Effect.forEach(globs, (g) =>
      expandGlob(repoRoot, g),
    );
    const dirs = [...new Set(expanded.flat())].sort();
    const out: Array<PackageRef> = [];
    for (const dir of dirs) {
      if (!(yield* hasVtestFolder(dir))) continue;
      const name = yield* readName(dir);
      out.push({ name, dir });
    }
    return out;
  });

/** A documented test parsed statically from a `.test.ts` source file. */
export interface StaticTestRef {
  readonly name: string;
  readonly vdoc: string | null;
  /** 1-based line of the `vtest(`/`test(` call. */
  readonly startLine: number;
  /** 1-based line of the matching close paren of that call. */
  readonly endLine: number;
}

const VTEST =
  /\bvtest\s*\(\s*(['"`])((?:[^\\]|\\.)*?)\1\s*,\s*(['"`])((?:[^\\]|\\.)*?)\3/g;
const PLAIN_TEST =
  /(?<![.\w])(?:test|it)(?:\.\w+)*\s*\(\s*(['"`])((?:[^\\]|\\.)*?)\1/g;

/** Convert a 0-based character offset into a 1-based line number. */
const offsetToLine = (source: string, offset: number): number => {
  let line = 1;
  const end = Math.min(offset, source.length);
  for (let i = 0; i < end; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
};

/**
 * Scan forward from `start` (an offset at or before the call's opening `(`) to
 * the offset of the paren that closes that call. Respects `'`, `"` and `` ` ``
 * string literals (with backslash escapes) so parens inside strings are
 * ignored. Returns the offset of the matching `)`, or the source length if the
 * call is unterminated.
 */
const matchingCloseParen = (source: string, start: number): number => {
  let i = start;
  while (i < source.length && source[i] !== '(') i++;
  let depth = 0;
  let quote: string | null = null;
  for (; i < source.length; i++) {
    const ch = source[i]!;
    if (quote !== null) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
};

/**
 * Statically extract the documented tests from a `.test.ts` source. Recognizes
 * `vtest(name, vdoc, …)` (with vdoc) and plain `test`/`it(name, …)` (vdoc
 * null), capturing each call's 1-based start/end line. No code is executed.
 */
export const extractTests = (source: string): ReadonlyArray<StaticTestRef> => {
  const out: Array<StaticTestRef> = [];
  const vtestNames = new Set<string>();
  const lineRange = (
    matchIndex: number,
  ): { startLine: number; endLine: number } => {
    const closeOffset = matchingCloseParen(source, matchIndex);
    return {
      startLine: offsetToLine(source, matchIndex),
      endLine: offsetToLine(source, closeOffset),
    };
  };
  VTEST.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VTEST.exec(source)) !== null) {
    const name = m[2]!;
    vtestNames.add(name);
    out.push({ name, vdoc: m[4]!, ...lineRange(m.index) });
  }
  PLAIN_TEST.lastIndex = 0;
  while ((m = PLAIN_TEST.exec(source)) !== null) {
    const name = m[2]!;
    if (vtestNames.has(name)) continue;
    out.push({ name, vdoc: null, ...lineRange(m.index) });
  }
  return out;
};
