import { findCycles as findNameCycles } from '../../../../contract/index.js';
import type {
  DependencyKind,
  Package,
  PackageCycle,
  PackageDependency,
} from '../../../contract/index.js';

/** What the package service reads from one manifest; no graph knowledge yet. */
export type PackageManifest = {
  readonly name: string;
  readonly path: string;
  readonly version?: string;
  readonly private: boolean;
  readonly declared: Readonly<Record<DependencyKind, readonly string[]>>;
};

export type PackageGraph = {
  readonly packages: readonly Package[];
  readonly cycles: readonly PackageCycle[];
};

const kindOrder: readonly DependencyKind[] = [
  'runtime',
  'dev',
  'peer',
  'optional',
];

/**
 * Builds the Package graph: a declared dependency is internal when its name
 * matches another Package's name, whatever version syntax declares it.
 */
export function buildPackageGraph(
  manifests: readonly PackageManifest[],
): PackageGraph {
  const names = new Set(manifests.map((manifest) => manifest.name));
  const packages = [...manifests]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((manifest): Package => ({
      name: manifest.name,
      path: manifest.path,
      ...(manifest.version === undefined ? {} : { version: manifest.version }),
      private: manifest.private,
      dependencies: internalDependencies(manifest, names),
    }));
  return { packages, cycles: findCycles(packages) };
}

function internalDependencies(
  manifest: PackageManifest,
  names: ReadonlySet<string>,
): PackageDependency[] {
  const kindsByName = new Map<string, DependencyKind[]>();
  for (const kind of kindOrder) {
    for (const name of manifest.declared[kind]) {
      if (!names.has(name) || name === manifest.name) continue;
      const kinds = kindsByName.get(name) ?? [];
      if (!kinds.includes(kind)) kinds.push(kind);
      kindsByName.set(name, kinds);
    }
  }
  return [...kindsByName.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, kinds]) => ({ name, kinds }));
}

/** Every elementary cycle over the union of kinds, each reported once. */
export function findCycles(packages: readonly Package[]): PackageCycle[] {
  const edges = new Map<string, readonly string[]>(
    packages.map((pkg) => [
      pkg.name,
      pkg.dependencies.map((dependency) => dependency.name),
    ]),
  );
  return findNameCycles(edges).map((members) => ({ packages: members }));
}
