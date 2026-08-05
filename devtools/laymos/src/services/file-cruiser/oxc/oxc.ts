import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Effect } from 'effect';

import type { FileGraph } from '../../../domain/file-graph/index.js';
import { CruiseError } from '../errors.js';
import { listSourceFiles, pathContains } from './file-scanner.js';
import {
  createResolver,
  extractSpecifiers,
  resolveSpecifier,
} from './import-resolver.js';

export function buildFileGraph(
  baseDir: string,
  sourceRoots: readonly string[],
  ignoredPaths: readonly string[],
): Effect.Effect<FileGraph, CruiseError> {
  return Effect.tryPromise({
    try: async () => {
      const realBaseDir = await realpath(baseDir);
      const files = await listSourceFiles(realBaseDir, sourceRoots);
      const eligibleFiles = files.filter(
        (path) => !ignoredPaths.some((ignored) => pathContains(ignored, path)),
      );
      const eligible = new Set(eligibleFiles);
      const imports = new Map<string, Set<string>>(
        files.map((path) => [path, new Set()]),
      );

      const resolver = createResolver();

      for (const path of eligibleFiles) {
        const absolute = resolve(realBaseDir, path);
        const specifiers = await extractSpecifiers(absolute);
        for (const specifier of specifiers) {
          const to = resolveSpecifier(
            resolver,
            realBaseDir,
            eligible,
            absolute,
            specifier,
          );
          if (to !== undefined) imports.get(path)!.add(to);
        }
      }

      return new Map(
        files.map((path) => [path, [...imports.get(path)!].sort()]),
      );
    },
    catch: (cause) => new CruiseError({ baseDir, cause }),
  }).pipe(Effect.withSpan('dependencies.extract'));
}
