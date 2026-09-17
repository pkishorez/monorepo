import type {
  DependencyKind,
  Package,
  PackageCycleViolation,
  PackageDependency,
} from '../schema/index.js';

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
  const seen = new Set<string>();
  const cycles: PackageCycleViolation[] = [];
  const stack: string[] = [];
  const onStack = new Set<string>();

  function visit(name: string) {
    stack.push(name);
    onStack.add(name);
    for (const next of edges.get(name) ?? []) {
      if (onStack.has(next)) {
        const cycle = rotate(stack.slice(stack.indexOf(next)));
        const key = cycle.join(' -> ');
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push({ packages: cycle });
        }
        continue;
      }
      visit(next);
    }
    stack.pop();
    onStack.delete(name);
  }

  for (const name of edges.keys()) visit(name);
  return cycles.sort((left, right) =>
    left.packages.join().localeCompare(right.packages.join()),
  );
}

function rotate(cycle: readonly string[]): string[] {
  let start = 0;
  cycle.forEach((name, index) => {
    if (name.localeCompare(cycle[start]!) < 0) start = index;
  });
  return [...cycle.slice(start), ...cycle.slice(0, start)];
}
