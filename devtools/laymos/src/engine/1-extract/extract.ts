import { readdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { Effect } from 'effect';
import skott from 'skott';

import { pathContains } from '../../config/path.js';
import type { StorySurface } from '../../story/core/story-surface.js';
import { ExtractError } from '../errors.js';

export interface FileNode {
  readonly path: string;
  readonly imports: readonly string[];
}

export interface FileGraph {
  readonly files: Readonly<Record<string, FileNode>>;
  readonly storyImports: readonly {
    readonly from: string;
    readonly to: string;
    readonly module: string;
  }[];
}

/** Extracts configured source roots with skott and type-only tracking enabled. */
export function extractFileGraph(
  baseDir: string,
  sourceRoots: readonly string[],
  ignoredPaths: readonly string[] = [],
  storySurfaces: readonly StorySurface[] = [],
): Effect.Effect<FileGraph, ExtractError> {
  return Effect.tryPromise({
    try: async () => {
      const inventoryFiles = await listSourceFiles(baseDir, sourceRoots);
      const storySurfaceByFile = new Map(
        inventoryFiles.flatMap((path) => {
          const surface = storySurfaces.find((candidate) =>
            pathContains(candidate.path, path),
          );
          return surface === undefined ? [] : [[path, surface] as const];
        }),
      );
      const storyFiles = new Set(storySurfaceByFile.keys());
      const architectureFiles = inventoryFiles.filter(
        (path) => !storyFiles.has(path),
      );
      const eligibleFiles = architectureFiles.filter(
        (path) => !ignoredPaths.some((ignored) => pathContains(ignored, path)),
      );
      const eligible = new Set(eligibleFiles);
      const imports = new Map<string, Set<string>>(
        architectureFiles.map((path) => [path, new Set()]),
      );
      const storyImports = new Map<
        string,
        { readonly from: string; readonly to: string; readonly module: string }
      >();
      const extracted = new Set<string>();

      for (const sourceRoot of sourceRoots) {
        const absolute = resolve(baseDir, sourceRoot);
        const sourceRootStat = await statOrUndefined(absolute);
        if (sourceRootStat === undefined) continue;
        if (sourceRootStat.isFile() && !eligible.has(sourceRoot)) continue;
        if (!sourceRootStat.isFile() && !sourceRootStat.isDirectory()) continue;
        const structure = sourceRootStat.isFile()
          ? await runSkott({ baseDir, ignoredPaths, entrypoint: absolute })
          : await runSkott({ baseDir, ignoredPaths, cwd: absolute });
        const resolutionBase = sourceRootStat.isFile()
          ? dirname(absolute)
          : absolute;
        for (const path of collectExtractedGraph({
          baseDir,
          eligible,
          graph: structure.graph,
          imports,
          resolutionBase,
          storyImports,
          storyFiles,
          storySurfaceByFile,
        })) {
          extracted.add(path);
        }
      }

      for (const path of eligibleFiles) {
        if (extracted.has(path)) continue;
        const entrypoint = resolve(baseDir, path);
        const structure = await runSkott({
          baseDir,
          ignoredPaths,
          entrypoint,
        });
        collectExtractedGraph({
          baseDir,
          eligible,
          graph: structure.graph,
          imports,
          resolutionBase: dirname(entrypoint),
          storyImports,
          storyFiles,
          storySurfaceByFile,
        });
      }

      return {
        files: Object.fromEntries(
          architectureFiles.map((path) => [
            path,
            { path, imports: [...imports.get(path)!].sort() },
          ]),
        ),
        storyImports: [...storyImports.values()].sort(
          (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
        ),
      };
    },
    catch: (cause) => new ExtractError({ baseDir, cause }),
  });
}

async function runSkott({
  baseDir,
  ignoredPaths,
  entrypoint,
  cwd,
}: {
  readonly baseDir: string;
  readonly ignoredPaths: readonly string[];
  readonly entrypoint?: string;
  readonly cwd?: string;
}) {
  const { getStructure } = await skott({
    ...(entrypoint === undefined ? { cwd: cwd ?? baseDir } : { entrypoint }),
    ignorePatterns: ignoredPaths.flatMap((path) => {
      const absolute = toPosixPath(resolve(baseDir, path));
      return [absolute, `${absolute}/**`];
    }),
    tsConfigPath: resolve(baseDir, 'tsconfig.json'),
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
  resolutionBase,
  storyImports,
  storyFiles,
  storySurfaceByFile,
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
  resolutionBase?: string;
  storyImports: Map<
    string,
    { readonly from: string; readonly to: string; readonly module: string }
  >;
  storyFiles: ReadonlySet<string>;
  storySurfaceByFile: ReadonlyMap<string, StorySurface>;
}): Set<string> {
  const extracted = new Set<string>();
  for (const node of Object.values(graph)) {
    const from = findEligiblePath(baseDir, node.id, eligible, resolutionBase);
    if (from === undefined) continue;
    extracted.add(from);
    for (const adjacent of node.adjacentTo) {
      const to = findEligiblePath(baseDir, adjacent, eligible, resolutionBase);
      if (to !== undefined) {
        imports.get(from)!.add(to);
        continue;
      }
      const storyFile = findEligiblePath(
        baseDir,
        adjacent,
        storyFiles,
        resolutionBase,
      );
      if (storyFile === undefined) continue;
      const storySurface = storySurfaceByFile.get(storyFile)!;
      storyImports.set(`${from}\0${storyFile}`, {
        from,
        to: storyFile,
        module: storySurface.modulePath,
      });
    }
  }
  return extracted;
}

const sourceExtensions = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'];

async function listSourceFiles(
  baseDir: string,
  sourceRoots: readonly string[],
): Promise<string[]> {
  const files = new Set<string>();
  for (const sourceRoot of sourceRoots) {
    const absolute = resolve(baseDir, sourceRoot);
    const sourceRootStat = await statOrUndefined(absolute);
    if (sourceRootStat?.isFile()) {
      if (isSupportedSourceFile(sourceRoot)) files.add(sourceRoot);
      continue;
    }
    if (!sourceRootStat?.isDirectory()) continue;
    const entries = await readdir(absolute, {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isFile() || !isSupportedSourceFile(entry.name)) continue;
      files.add(
        toPosixPath(relative(baseDir, join(entry.parentPath, entry.name))),
      );
    }
  }
  return [...files].sort();
}

async function statOrUndefined(path: string) {
  try {
    return await stat(path);
  } catch (cause) {
    if (
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      cause.code === 'ENOENT'
    ) {
      return undefined;
    }
    throw cause;
  }
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
  resolutionBase?: string,
): string | undefined {
  const absoluteCandidates = isAbsolute(path)
    ? [path]
    : [
        resolve(process.cwd(), path),
        ...(resolutionBase === undefined
          ? []
          : [resolve(resolutionBase, path)]),
      ];
  return absoluteCandidates
    .map((candidate) => toPosixPath(relative(baseDir, candidate)))
    .find((candidate) => eligible.has(candidate));
}

function toPosixPath(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/');
}
