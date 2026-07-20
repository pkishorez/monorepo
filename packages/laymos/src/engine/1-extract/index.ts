import { execFile } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { Effect } from 'effect';
import skott from 'skott';

import { pathContains } from '../../config/path.js';
import { ExtractError } from '../errors.js';

export interface FileNode {
  readonly path: string;
  readonly imports: readonly string[];
}

export interface FileGraph {
  readonly files: Readonly<Record<string, FileNode>>;
}

/** Extracts Git-visible source files with skott and type-only tracking enabled. */
export function extractFileGraph(
  baseDir: string,
  ignoredPaths: readonly string[] = [],
): Effect.Effect<FileGraph, ExtractError> {
  return Effect.tryPromise({
    try: async () => {
      const inventoryFiles = await listGitSourceFiles(baseDir);
      const eligibleFiles = inventoryFiles.filter(
        (path) => !ignoredPaths.some((ignored) => pathContains(ignored, path)),
      );
      const eligible = new Set(eligibleFiles);
      const rootStructure = await runSkott(baseDir, ignoredPaths);
      const imports = new Map<string, Set<string>>(
        inventoryFiles.map((path) => [path, new Set()]),
      );
      const extracted = collectExtractedGraph({
        baseDir,
        eligible,
        graph: rootStructure.graph,
        imports,
      });

      for (const path of eligibleFiles) {
        if (extracted.has(path)) continue;
        const entrypoint = resolve(baseDir, path);
        const structure = await runSkott(baseDir, ignoredPaths, entrypoint);
        collectExtractedGraph({
          baseDir,
          eligible,
          graph: structure.graph,
          imports,
          entrypoint,
        });
      }

      return {
        files: Object.fromEntries(
          inventoryFiles.map((path) => [
            path,
            { path, imports: [...imports.get(path)!].sort() },
          ]),
        ),
      };
    },
    catch: (cause) => new ExtractError({ baseDir, cause }),
  });
}

async function runSkott(
  baseDir: string,
  ignoredPaths: readonly string[],
  entrypoint?: string,
) {
  const { getStructure } = await skott({
    ...(entrypoint === undefined ? { cwd: baseDir } : { entrypoint }),
    ignorePatterns: ignoredPaths.flatMap((path) => {
      const absolute = toPosixPath(resolve(baseDir, path));
      return [absolute, `${absolute}/**`];
    }),
    tsConfigPath:
      entrypoint === undefined
        ? 'tsconfig.json'
        : resolve(baseDir, 'tsconfig.json'),
    dependencyTracking: {
      builtin: false,
      thirdParty: false,
      typeOnly: true,
    },
    fileExtensions: [...sourceExtensions],
    incremental: false,
  });
  return getStructure();
}

function collectExtractedGraph({
  baseDir,
  eligible,
  graph,
  imports,
  entrypoint,
}: {
  baseDir: string;
  eligible: ReadonlySet<string>;
  graph: Readonly<
    Record<
      string,
      { readonly id: string; readonly adjacentTo: readonly string[] }
    >
  >;
  imports: Map<string, Set<string>>;
  entrypoint?: string;
}): Set<string> {
  const extracted = new Set<string>();
  for (const node of Object.values(graph)) {
    const from = findEligiblePath(baseDir, node.id, eligible, entrypoint);
    if (from === undefined) continue;
    extracted.add(from);
    for (const adjacent of node.adjacentTo) {
      const to = findEligiblePath(baseDir, adjacent, eligible, entrypoint);
      if (to !== undefined) imports.get(from)!.add(to);
    }
  }
  return extracted;
}

const sourceExtensions = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'];

function listGitSourceFiles(baseDir: string): Promise<string[]> {
  return new Promise((resolveFiles, reject) => {
    execFile(
      'git',
      [
        '-C',
        baseDir,
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '-z',
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolveFiles(
          stdout
            .split('\0')
            .filter(isSupportedSourceFile)
            .map(toPosixPath)
            .sort(),
        );
      },
    );
  });
}

function isSupportedSourceFile(path: string): boolean {
  return (
    sourceExtensions.some((extension) => path.endsWith(extension)) &&
    !path.endsWith('.d.ts') &&
    !/\.min\.(?:[cm]?js|jsx)$/.test(path)
  );
}

function findEligiblePath(
  baseDir: string,
  path: string,
  eligible: ReadonlySet<string>,
  entrypoint?: string,
): string | undefined {
  const absoluteCandidates = isAbsolute(path)
    ? [path]
    : [
        resolve(process.cwd(), path),
        ...(entrypoint === undefined ? [] : [resolve(entrypoint, '..', path)]),
      ];
  return absoluteCandidates
    .map((candidate) => toPosixPath(relative(baseDir, candidate)))
    .find((candidate) => eligible.has(candidate));
}

function toPosixPath(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/');
}
