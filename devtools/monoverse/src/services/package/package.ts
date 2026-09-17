import { join } from 'node:path';

import { Effect, FileSystem } from 'effect';

import type { PackageManifest } from '../../domain/package-graph/index.js';
import type { DependencyKind } from '../../domain/schema/index.js';
import { ManifestError } from './errors.js';

const fields: Readonly<Record<DependencyKind, string>> = {
  runtime: 'dependencies',
  dev: 'devDependencies',
  peer: 'peerDependencies',
  optional: 'optionalDependencies',
};

/**
 * Reads one `package.json` and keeps what Monoverse needs from it. A manifest
 * without a name cannot be depended on by name and yields nothing.
 */
export function readPackageManifest(
  monorepoRoot: string,
  packagePath: string,
): Effect.Effect<
  PackageManifest | undefined,
  ManifestError,
  FileSystem.FileSystem
> {
  const manifestPath = join(monorepoRoot, packagePath, 'package.json');
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const text = yield* fileSystem
      .readFileString(manifestPath)
      .pipe(
        Effect.mapError(
          (cause) =>
            new ManifestError({ reason: 'read', path: manifestPath, cause }),
        ),
      );
    const json = yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: (cause) =>
        new ManifestError({ reason: 'parse', path: manifestPath, cause }),
    });
    if (!isRecord(json) || typeof json.name !== 'string' || json.name === '') {
      return undefined;
    }
    const hasLaymos = yield* fileSystem
      .exists(join(monorepoRoot, packagePath, 'laymos.config.json'))
      .pipe(Effect.orElseSucceed(() => false));
    return {
      name: json.name,
      path: packagePath,
      ...(typeof json.version === 'string' ? { version: json.version } : {}),
      private: json.private === true,
      hasLaymos,
      declared: {
        runtime: namesOf(json, 'runtime'),
        dev: namesOf(json, 'dev'),
        peer: namesOf(json, 'peer'),
        optional: namesOf(json, 'optional'),
      },
    } satisfies PackageManifest;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function namesOf(
  manifest: Record<string, unknown>,
  kind: DependencyKind,
): readonly string[] {
  const value = manifest[fields[kind]];
  return isRecord(value) ? Object.keys(value) : [];
}
