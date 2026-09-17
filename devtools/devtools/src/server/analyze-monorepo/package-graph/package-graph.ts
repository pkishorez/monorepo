import type {
  DependencyKind,
  Package,
  PackageCycleViolation,
  PackageDependency,
} from '../../../rpc/index.js';

/** What the package service reads from one manifest; no graph knowledge yet. */
export type PackageManifest = {
  readonly name: string;
  readonly path: string;
  readonly version?: string;
  readonly private: boolean;
  readonly hasLaymos: boolean;
  readonly declared: Readonly<Record<DependencyKind, readonly string[]>>;
};

export type PackageGraph = {
  readonly packages: readonly Package[];
  readonly violations: readonly PackageCycleViolation[];
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
      group: groupOf(manifest.path),
      ...(manifest.version === undefined ? {} : { version: manifest.version }),
      private: manifest.private,
      hasLaymos: manifest.hasLaymos,
      dependencies: internalDependencies(manifest, names),
    }));
  return { packages, violations: findCycles(packages) };
}

function groupOf(path: string): string {
  const [first] = path.split('/');
  return first === undefined || first === '' || first === '.' ? path : first;
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
export function findCycles(
  packages: readonly Package[],
): PackageCycleViolation[] {
  const edges = new Map<string, readonly string[]>(
    packages.map((pkg) => [
      pkg.name,
      pkg.dependencies.map((dependency) => dependency.name),
    ]),
  );
  const predecessors = new Map<string, string[]>();
  for (const [name, dependencies] of edges) {
    for (const dependency of dependencies) {
      const incoming = predecessors.get(dependency) ?? [];
      incoming.push(name);
      predecessors.set(dependency, incoming);
    }
  }
  const cycles: PackageCycleViolation[] = [];

  for (const start of edges.keys()) {
    // A cycle starts at its smallest name and only visits nodes that can return
    // to it. This avoids enumerating every path through acyclic dependencies.
    const canReturn = new Set([start]);
    const pending = [start];
    while (pending.length > 0) {
      for (const previous of predecessors.get(pending.pop()!) ?? []) {
        if (previous.localeCompare(start) < 0 || canReturn.has(previous))
          continue;
        canReturn.add(previous);
        pending.push(previous);
      }
    }
    const path = [start];
    const onPath = new Set(path);
    function visit(name: string) {
      for (const next of edges.get(name) ?? []) {
        if (next === start) {
          cycles.push({ packages: [...path] });
        } else if (canReturn.has(next) && !onPath.has(next)) {
          path.push(next);
          onPath.add(next);
          visit(next);
          onPath.delete(next);
          path.pop();
        }
      }
    }
    visit(start);
  }
  return cycles.sort((left, right) =>
    left.packages.join().localeCompare(right.packages.join()),
  );
}
