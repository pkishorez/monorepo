import { join, posix } from 'node:path';

import { Effect } from 'effect';

import type { DependencyKind } from '../../../contract/index.js';
import { readText, type Snapshot } from '../../snapshot/index.js';
import type { PackageManifest } from '../package-graph/index.js';
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
  snapshot: Snapshot,
  packagePath: string,
  fallbackName?: string,
): Effect.Effect<PackageManifest | undefined, ManifestError> {
  const manifestPath = join(snapshot.root, packagePath, 'package.json');
  return Effect.gen(function* () {
    const text = yield* Effect.tryPromise({
      try: () =>
        readText(snapshot, posix.normalize(`${packagePath}/package.json`)),
      catch: (cause) =>
        new ManifestError({ reason: 'read', path: manifestPath, cause }),
    });
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
    return {
      name,
      path: packagePath,
      ...(typeof json.version === 'string' ? { version: json.version } : {}),
      private: json.private === true,
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
