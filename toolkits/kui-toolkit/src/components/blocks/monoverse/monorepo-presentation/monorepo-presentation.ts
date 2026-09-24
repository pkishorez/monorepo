import type { ChangeStatus } from 'laymos';

import { rollUpChanges } from '../../git-changes';
import type {
  DependencyKind,
  MonorepoAnalysis,
  Package,
  PackageCycleViolation,
} from '../analysis';

export const dependencyKinds: readonly DependencyKind[] = [
  'runtime',
  'dev',
  'peer',
  'optional',
];

export const dependencyKindLabels: Readonly<Record<DependencyKind, string>> = {
  runtime: 'Runtime',
  dev: 'Development',
  peer: 'Peer',
  optional: 'Optional',
};

// A Package pair is drawn once. When several Dependency kinds declare the
// same pair, the strongest one decides how the edge looks.
const kindStrength: Readonly<Record<DependencyKind, number>> = {
  runtime: 0,
  peer: 1,
  optional: 2,
  dev: 3,
};

export interface PackageEdge {
  readonly id: string;
  // The Package that declares the dependency.
  readonly from: string;
  // The Package it depends on.
  readonly to: string;
  readonly kinds: readonly DependencyKind[];
  readonly strongestKind: DependencyKind;
}

export function packageEdgeId(from: string, to: string): string {
  return `${from}->${to}`;
}

export function strongestDependencyKind(
  kinds: readonly DependencyKind[],
): DependencyKind {
  return [...kinds].sort((a, b) => kindStrength[a] - kindStrength[b])[0]!;
}

// Only pairs where both ends are Packages of this Monorepo, and only the
// Dependency kinds currently shown. A pair with no kind left is hidden.
export function visibleEdges(
  analysis: MonorepoAnalysis,
  activeKinds: ReadonlySet<DependencyKind>,
): readonly PackageEdge[] {
  const names = new Set(analysis.packages.map(({ name }) => name));
  return analysis.packages.flatMap((pkg) =>
    pkg.dependencies.flatMap(({ name, kinds }) => {
      if (!names.has(name) || name === pkg.name) return [];
      const shown = kinds.filter((kind) => activeKinds.has(kind));
      if (shown.length === 0) return [];
      return [
        {
          id: packageEdgeId(pkg.name, name),
          from: pkg.name,
          to: name,
          kinds: shown,
          strongestKind: strongestDependencyKind(shown),
        },
      ];
    }),
  );
}

export interface PackageRankStack {
  // Rank 0 holds the Packages nothing visible depends on; each Package sits
  // below every Package that depends on it.
  readonly ranks: readonly (readonly string[])[];
  // Packages touched by no visible edge, drawn as the last row.
  readonly isolated: readonly string[];
}

export function rankPackages(
  packages: readonly Package[],
  edges: readonly PackageEdge[],
): PackageRankStack {
  const names = packages.map(({ name }) => name);
  const connected = new Set(edges.flatMap(({ from, to }) => [from, to]));
  const dependents = new Map(names.map((name) => [name, new Set<string>()]));
  for (const { from, to } of edges) dependents.get(to)?.add(from);

  const rankOf = new Map<string, number>();
  const onStack = new Set<string>();
  // Longest path from a root. An edge back into a Package still on the stack
  // closes a Package cycle and is skipped so the walk terminates.
  const rank = (name: string): number => {
    const known = rankOf.get(name);
    if (known !== undefined) return known;
    onStack.add(name);
    let value = 0;
    for (const dependent of dependents.get(name) ?? []) {
      if (onStack.has(dependent)) continue;
      value = Math.max(value, rank(dependent) + 1);
    }
    onStack.delete(name);
    rankOf.set(name, value);
    return value;
  };

  const ranks: string[][] = [];
  const isolated: string[] = [];
  for (const name of [...names].sort()) {
    if (!connected.has(name)) {
      isolated.push(name);
      continue;
    }
    const value = rank(name);
    (ranks[value] ??= []).push(name);
  }
  return { ranks: ranks.map((row) => row ?? []), isolated };
}

export interface PackageFocus {
  // The Package whose connections are drawn loudest: the hovered one, or the
  // selected one when nothing is hovered.
  readonly focusedPackage?: string;
  // The Packages and edges drawn at full strength.
  readonly emphasizedPackages: ReadonlySet<string>;
  readonly emphasizedEdgeIds: ReadonlySet<string>;
  // The rest of the selection's neighbourhood while one of its members is
  // hovered: kept legible at half strength so the hover reads against it.
  readonly softenedPackages: ReadonlySet<string>;
  readonly softenedEdgeIds: ReadonlySet<string>;
}

export type PackageEmphasis = 'neutral' | 'emphasized' | 'softened' | 'dimmed';

const noFocus: PackageFocus = {
  emphasizedPackages: new Set(),
  emphasizedEdgeIds: new Set(),
  softenedPackages: new Set(),
  softenedEdgeIds: new Set(),
};

// Without a selection, hover previews a focus: the hovered Package and its
// direct neighbours. With a selection, the selection's neighbourhood is the
// whole highlight and hover never widens it: hovering one of its members
// singles that member and its edge to the selection out, softening the rest,
// and hovering anything else changes nothing.
export function resolvePackageFocus({
  selectedPackage,
  hoveredPackage,
  edges,
}: {
  readonly selectedPackage?: string | null;
  readonly hoveredPackage?: string | null;
  readonly edges: readonly PackageEdge[];
}): PackageFocus {
  if (selectedPackage === null || selectedPackage === undefined) {
    if (hoveredPackage === null || hoveredPackage === undefined) return noFocus;
    const preview = neighbourhood(hoveredPackage, edges);
    return {
      focusedPackage: hoveredPackage,
      emphasizedPackages: preview.packages,
      emphasizedEdgeIds: preview.edgeIds,
      softenedPackages: new Set(),
      softenedEdgeIds: new Set(),
    };
  }

  const base = neighbourhood(selectedPackage, edges);
  const singled =
    hoveredPackage !== null &&
    hoveredPackage !== undefined &&
    hoveredPackage !== selectedPackage &&
    base.packages.has(hoveredPackage)
      ? hoveredPackage
      : undefined;
  if (singled === undefined) {
    return {
      focusedPackage: selectedPackage,
      emphasizedPackages: base.packages,
      emphasizedEdgeIds: base.edgeIds,
      softenedPackages: new Set(),
      softenedEdgeIds: new Set(),
    };
  }

  const emphasizedEdgeIds = new Set(
    edges
      .filter(
        ({ from, to }) =>
          (from === selectedPackage && to === singled) ||
          (from === singled && to === selectedPackage),
      )
      .map(({ id }) => id),
  );
  const emphasizedPackages = new Set([selectedPackage, singled]);
  return {
    focusedPackage: singled,
    emphasizedPackages,
    emphasizedEdgeIds,
    softenedPackages: new Set(
      [...base.packages].filter((name) => !emphasizedPackages.has(name)),
    ),
    softenedEdgeIds: new Set(
      [...base.edgeIds].filter((id) => !emphasizedEdgeIds.has(id)),
    ),
  };
}

function neighbourhood(
  target: string,
  edges: readonly PackageEdge[],
): { readonly packages: Set<string>; readonly edgeIds: Set<string> } {
  const packages = new Set([target]);
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (edge.from !== target && edge.to !== target) continue;
    packages.add(edge.from);
    packages.add(edge.to);
    edgeIds.add(edge.id);
  }
  return { packages, edgeIds };
}

export function packageEmphasis(
  focus: PackageFocus,
  name: string,
): PackageEmphasis {
  if (focus.focusedPackage === undefined) return 'neutral';
  if (focus.emphasizedPackages.has(name)) return 'emphasized';
  if (focus.softenedPackages.has(name)) return 'softened';
  return 'dimmed';
}

export function edgeEmphasis(focus: PackageFocus, id: string): PackageEmphasis {
  if (focus.focusedPackage === undefined) return 'neutral';
  if (focus.emphasizedEdgeIds.has(id)) return 'emphasized';
  if (focus.softenedEdgeIds.has(id)) return 'softened';
  return 'dimmed';
}

export interface PackageDecoration {
  readonly hasLaymos: boolean;
  readonly inCycle: boolean;
  // The Package change status; absent while unchanged or changes are hidden.
  readonly changeStatus?: ChangeStatus;
}

export function decoratePackages(
  analysis: MonorepoAnalysis,
  changeStatuses: ReadonlyMap<string, ChangeStatus> = new Map(),
): ReadonlyMap<string, PackageDecoration> {
  const inCycle = new Set(
    analysis.violations.flatMap(({ packages }) => packages),
  );
  return new Map(
    analysis.packages.map((pkg) => {
      const changeStatus = changeStatuses.get(pkg.name);
      return [
        pkg.name,
        {
          hasLaymos: pkg.hasLaymos,
          inCycle: inCycle.has(pkg.name),
          ...(changeStatus === undefined ? {} : { changeStatus }),
        },
      ];
    }),
  );
}

/**
 * Each Package's standing in a Change set, by the Laymos Module rule: added
 * when every file git knows beneath it is added, modified when any is added or
 * modified. A file belongs to the deepest Package folder holding it; files
 * outside every Package belong to none.
 */
export function packageChangeStatuses(
  packages: readonly Package[],
  changedFiles: ReadonlyMap<string, ChangeStatus>,
  knownFiles: readonly string[],
): ReadonlyMap<string, ChangeStatus> {
  const folders = [...packages].sort((a, b) => b.path.length - a.path.length);
  const membership = new Map<string, string>();
  for (const file of knownFiles) {
    const owner = folders.find(({ path }) => file.startsWith(`${path}/`));
    if (owner !== undefined) membership.set(file, owner.name);
  }
  return rollUpChanges(membership, changedFiles);
}

export interface PackageGroupListing {
  readonly group: string;
  readonly packages: readonly Package[];
}

export function groupPackages(
  packages: readonly Package[],
): readonly PackageGroupListing[] {
  const byGroup = new Map<string, Package[]>();
  for (const pkg of packages) {
    (byGroup.get(pkg.group) ?? byGroup.set(pkg.group, []).get(pkg.group)!).push(
      pkg,
    );
  }
  return [...byGroup]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, members]) => ({
      group,
      packages: [...members].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

export interface PackageRelation {
  readonly name: string;
  readonly kinds: readonly DependencyKind[];
}

export interface PackageRelations {
  readonly dependencies: readonly PackageRelation[];
  readonly dependents: readonly PackageRelation[];
}

// Every Dependency kind, whatever is currently shown: a details panel answers
// what the manifest says, not what the canvas draws.
export function packageRelations(
  analysis: MonorepoAnalysis,
  name: string,
): PackageRelations {
  const names = new Set(analysis.packages.map((pkg) => pkg.name));
  const self = analysis.packages.find((pkg) => pkg.name === name);
  const dependencies = (self?.dependencies ?? [])
    .filter((dependency) => names.has(dependency.name))
    .map(({ name: target, kinds }) => ({ name: target, kinds }));
  const dependents = analysis.packages.flatMap((pkg) => {
    const dependency = pkg.dependencies.find((entry) => entry.name === name);
    return dependency === undefined
      ? []
      : [{ name: pkg.name, kinds: dependency.kinds }];
  });
  const byName = (a: PackageRelation, b: PackageRelation) =>
    a.name.localeCompare(b.name);
  return {
    dependencies: [...dependencies].sort(byName),
    dependents: dependents.sort(byName),
  };
}

export function packageCycles(
  analysis: MonorepoAnalysis,
  name: string,
): readonly PackageCycleViolation[] {
  return analysis.violations.filter(({ packages }) => packages.includes(name));
}

export interface MonorepoView {
  // The Packages drawn: every Package, or only the changed ones when
  // unchanged Packages are hidden.
  readonly packages: readonly Package[];
  readonly edges: readonly PackageEdge[];
  readonly rankStack: PackageRankStack;
  readonly decorations: ReadonlyMap<string, PackageDecoration>;
}

export interface MonorepoChanges {
  readonly statuses: ReadonlyMap<string, ChangeStatus>;
  readonly includeUnchanged: boolean;
}

// Hiding unchanged Packages drops them and their edges before ranking, so the
// Package rank stack closes around what is left.
export function buildMonorepoView(
  analysis: MonorepoAnalysis,
  activeKinds: ReadonlySet<DependencyKind>,
  changes?: MonorepoChanges,
): MonorepoView {
  const packages =
    changes === undefined || changes.includeUnchanged
      ? analysis.packages
      : analysis.packages.filter(({ name }) => changes.statuses.has(name));
  const shown = { ...analysis, packages };
  const edges = visibleEdges(shown, activeKinds);
  return {
    packages,
    edges,
    rankStack: rankPackages(packages, edges),
    decorations: decoratePackages(analysis, changes?.statuses),
  };
}
