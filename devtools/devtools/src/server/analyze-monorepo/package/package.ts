import { join } from 'node:path';

import { Effect, FileSystem } from 'effect';

import type { PackageManifest } from '../package-graph/index.js';
import type { DependencyKind } from '../../../rpc/index.js';
import { ManifestError } from './errors.js';

const fields: Readonly<Record<DependencyKind, string>> = {
  runtime: 'dependencies',
  dev: 'devDependencies',
  peer: 'peerDependencies',
  optional: 'optionalDependencies',
};

/**
 * Reads one `package.json` and keeps what Monoverse needs from it. A manifest
 * that is missing yields nothing, and so does one with no name unless
 * `fallbackName` names it.
 */
export function readPackageManifest(
  monorepoRoot: string,
  packagePath: string,
  fallbackName?: string,
): Effect.Effect<
  PackageManifest | undefined,
  ManifestError,
  FileSystem.FileSystem
> {
  const manifestPath = join(monorepoRoot, packagePath, 'package.json');
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const text = yield* fileSystem.readFileString(manifestPath).pipe(
      Effect.catchIf(
        (cause) => cause.reason._tag === 'NotFound',
        () => Effect.succeed(undefined),
      ),
      Effect.mapError(
        (cause) =>
          new ManifestError({ reason: 'read', path: manifestPath, cause }),
      ),
    );
    if (text === undefined) return undefined;
    const json = yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: (cause) =>
        new ManifestError({ reason: 'parse', path: manifestPath, cause }),
    });
    if (!isRecord(json)) return undefined;
    const name =
      typeof json.name === 'string' && json.name !== ''
        ? json.name
        : fallbackName;
    if (name === undefined) return undefined;
    // Absent or unreadable, a Laymos Config means no Laymos badge; one that
    // names a Stories path earns the Stories badge too.
    const laymosConfig = yield* fileSystem
      .readFileString(join(monorepoRoot, packagePath, 'laymos.config.json'))
      .pipe(Effect.orElseSucceed(() => undefined));
    const hasLaymos = laymosConfig !== undefined;
    const hasStories = hasLaymos && declaresStories(laymosConfig);
    return {
      name,
      path: packagePath,
      ...(typeof json.version === 'string' ? { version: json.version } : {}),
      private: json.private === true,
      hasLaymos,
      hasStories,
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

function declaresStories(config: string): boolean {
  try {
    const json = JSON.parse(config) as unknown;
    return isRecord(json) && typeof json.storiesPath === 'string';
  } catch {
    return false;
  }
}

function namesOf(
  manifest: Record<string, unknown>,
  kind: DependencyKind,
): readonly string[] {
  const value = manifest[fields[kind]];
  return isRecord(value) ? Object.keys(value) : [];
}
