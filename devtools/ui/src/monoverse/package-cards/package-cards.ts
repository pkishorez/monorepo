import type {
  ArchitectureAnalysis,
  ChangeSet,
  ChangeStatus,
  ModuleImport,
  TreeNode,
} from 'laymos';

import type { DependencyKind, MonorepoAnalysis, Package } from '../analysis';
import type { ChangeIndex } from '../../laymos/project-changes';
import type { FindingCount } from '../../laymos/laymo';

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

/**
 * The Monoverse layout: Package groups drawn as boxes holding their
 * Packages, or every Package ranked together.
 */
export type MonoverseLayout = 'folders' | 'ranks';

/**
 * A Monorepo as the Laymo draws it. Packages are the cards a Laymo calls
 * Modules and Package group folders the cards it calls Wrappers; each
 * Package dependency shown is one line, and a dependency inside a Package
 * cycle is a Violation. Nothing here is a Laymos Config: there are no Rules,
 * so a Package group's Packages rank by their dependencies alone.
 */
export interface PackageCards {
  readonly analysis: ArchitectureAnalysis;
  /** Each card's Package change status by path, Package groups rolled up. */
  readonly changeIndex: ChangeIndex | undefined;
  /** Every Package drawn, by card path; a Deleted Package has no manifest left. */
  readonly packages: ReadonlyMap<string, Package | undefined>;
  /** The folder a card stands for, relative to the root, `.` for the root. */
  readonly folderOf: (cardPath: string) => string;
  /** The paths of the Deleted Packages drawn. */
  readonly deleted: readonly string[];
  readonly findings: readonly FindingCount[];
  /** The Package group cards, to open them from the start. */
  readonly groups: readonly string[];
}

export interface PackageCardsInput {
  readonly analysis: MonorepoAnalysis;
  readonly layout: MonoverseLayout;
  readonly activeKinds: ReadonlySet<DependencyKind>;
  /** Absent when changes are not shown. */
  readonly changes?: ChangeSet | undefined;
  /** Every path git knows, to tell an added Package from a modified one. */
  readonly knownFiles?: readonly string[] | undefined;
  readonly showDeleted: boolean;
}

// Nothing is declared about a Monorepo: the picture has no Rules.
const noConfig: ArchitectureAnalysis['config'] = {
  sourceRoots: ['.'],
  ignoredPaths: [],
  fileModules: [],
  rules: {},
  exceptions: [],
};

const parentOf = (path: string) => {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '.' : path.slice(0, slash);
};

const within = (folder: string, path: string) =>
  folder === '.' || path === folder || path.startsWith(`${folder}/`);

/**
 * The Deleted Packages of a Change set: a deleted `package.json` whose
 * folder is no Package now, lying in a folder that still holds Packages,
 * so a fixture's manifest deep in some Package never reads as one.
 */
export function deletedPackagesOf(
  packages: readonly Package[],
  changes: ChangeSet,
): readonly string[] {
  const paths = new Set(packages.map(({ path }) => path));
  const groups = new Set(packages.map(({ path }) => parentOf(path)));
  return changes.files
    .flatMap(({ path, status }) =>
      status === 'deleted' && path.endsWith('/package.json')
        ? [parentOf(path)]
        : [],
    )
    .filter((folder) => !paths.has(folder) && groups.has(parentOf(folder)))
    .sort();
}

/**
 * Each Package's change status, by the Laymos Module rule: added when every
 * file git knows beneath it is added, modified when any file beneath it
 * changed, deleted for a Deleted Package. A file belongs to the deepest
 * Package holding it; files outside every Package belong to none. A
 * Package group reads added when every Package in it is added, modified
 * when any changed.
 */
export function packageChangeIndex(
  packagePaths: readonly string[],
  deleted: readonly string[],
  groups: readonly string[],
  changes: ChangeSet,
  knownFiles: readonly string[],
): ChangeIndex {
  const files = new Map(
    changes.files.map(({ path, status }) => [path, status] as const),
  );
  const deepestFirst = [...packagePaths, ...deleted].sort(
    (a, b) => b.length - a.length,
  );
  const ownerOf = (file: string) =>
    deepestFirst.find((folder) => within(folder, file));
  const total = new Map<string, number>();
  const added = new Map<string, number>();
  const touched = new Set<string>();
  for (const file of knownFiles) {
    const owner = ownerOf(file);
    if (owner === undefined) continue;
    total.set(owner, (total.get(owner) ?? 0) + 1);
    if (files.get(file) === 'added')
      added.set(owner, (added.get(owner) ?? 0) + 1);
  }
  for (const path of files.keys()) {
    const owner = ownerOf(path);
    if (owner !== undefined) touched.add(owner);
  }
  const modules = new Map<string, ChangeStatus>();
  const gone = new Set(deleted);
  for (const owner of touched)
    modules.set(
      owner,
      gone.has(owner)
        ? 'deleted'
        : total.has(owner) && added.get(owner) === total.get(owner)
          ? 'added'
          : 'modified',
    );
  for (const group of groups) {
    const inside = [...packagePaths, ...deleted].filter(
      (path) => path !== group && within(group, path),
    );
    const statuses = inside.map((path) => modules.get(path));
    if (statuses.every((status) => status === undefined)) continue;
    modules.set(
      group,
      statuses.every((status) => status === 'added')
        ? 'added'
        : statuses.every((status) => status === 'deleted')
          ? 'deleted'
          : 'modified',
    );
  }
  return {
    baseRef: changes.baseRef,
    files,
    modules,
    // Deleted Packages are drawn as cards of their own, not put back.
    deletedModules: [],
  };
}

/** The Package dependencies inside a Package cycle, as `from->to` pairs of names. */
function cycleEdgesOf(analysis: MonorepoAnalysis): ReadonlySet<string> {
  const edges = new Set<string>();
  for (const { packages } of analysis.violations)
    packages.forEach((name, at) =>
      edges.add(`${name}->${packages[(at + 1) % packages.length]!}`),
    );
  return edges;
}

/**
 * The tree the cards stand in. In the Folders layout every folder above a
 * Package is a card holding what lies beneath it; in Ranks every Package
 * stands straight in the Monorepo.
 */
function treeOf(
  paths: readonly string[],
  layout: MonoverseLayout,
): { readonly nodes: readonly TreeNode[]; readonly groups: readonly string[] } {
  const packages = new Set(paths);
  const children = new Map<string, string[]>([['.', []]]);
  const parents = new Map<string, string>();
  const place = (path: string, parent: string) => {
    if (parents.has(path)) return;
    parents.set(path, parent);
    children.set(path, children.get(path) ?? []);
    (children.get(parent) ?? children.set(parent, []).get(parent)!).push(path);
  };
  for (const path of [...paths].sort()) {
    if (layout === 'ranks') {
      place(path, '.');
      continue;
    }
    const segments = path.split('/');
    let parent = '.';
    for (let depth = 1; depth <= segments.length; depth += 1) {
      const folder = segments.slice(0, depth).join('/');
      place(folder, parent);
      parent = folder;
    }
  }
  const nodes: TreeNode[] = [
    {
      path: '.',
      kind: 'wrapper',
      shape: 'folder',
      ownFiles: [],
      children: children.get('.') ?? [],
    },
    ...[...parents].map(([path, parent]): TreeNode => ({
      path,
      kind: packages.has(path) ? 'module' : 'wrapper',
      shape: 'folder',
      ownFiles: [],
      parent,
      children: children.get(path) ?? [],
    })),
  ];
  return {
    nodes,
    groups: [...parents.keys()].filter((path) => !packages.has(path)),
  };
}

/**
 * The card a Single Package's one Package stands in. Its folder is the root,
 * `.`, which is the card holding the whole picture, so its own card takes
 * the root folder's name.
 */
function rootCardOf(analysis: MonorepoAnalysis): string | undefined {
  if (analysis.kind !== 'single-package') return undefined;
  return analysis.path.split('/').filter(Boolean).pop() ?? analysis.name;
}

/** Draws a Monorepo with the Laymo: see {@link PackageCards}. */
export function packageCards(input: PackageCardsInput): PackageCards {
  const rootCard = rootCardOf(input.analysis);
  if (rootCard === undefined) return monorepoCards(input);
  const cards = monorepoCards({
    ...input,
    analysis: {
      ...input.analysis,
      packages: input.analysis.packages.map((pkg) =>
        pkg.path === '.' ? { ...pkg, path: rootCard } : pkg,
      ),
    },
    changes: undefined,
  });
  // Every file belongs to the one Package, and it lists no workspace globs
  // a deleted manifest could have been matched by.
  const changeIndex =
    input.changes === undefined
      ? undefined
      : packageChangeIndex(
          ['.'],
          [],
          [],
          input.changes,
          input.knownFiles ?? [],
        );
  return {
    ...cards,
    packages: new Map(input.analysis.packages.map((pkg) => [rootCard, pkg])),
    changeIndex:
      changeIndex === undefined
        ? undefined
        : {
            ...changeIndex,
            modules: new Map(
              [...changeIndex.modules].map(([path, status]) => [
                path === '.' ? rootCard : path,
                status,
              ]),
            ),
          },
    folderOf: (cardPath) => (cardPath === rootCard ? '.' : cardPath),
  };
}

function monorepoCards({
  analysis,
  layout,
  activeKinds,
  changes,
  knownFiles = [],
  showDeleted,
}: PackageCardsInput): PackageCards {
  const deleted =
    changes === undefined || !showDeleted
      ? []
      : deletedPackagesOf(analysis.packages, changes);
  const byName = new Map(analysis.packages.map((pkg) => [pkg.name, pkg]));
  const packages = new Map<string, Package | undefined>([
    ...analysis.packages.map((pkg) => [pkg.path, pkg] as const),
    ...deleted.map((path) => [path, undefined] as const),
  ]);
  const { nodes, groups } = treeOf([...packages.keys()], layout);

  const inCycle = cycleEdgesOf(analysis);
  const imports = analysis.packages.flatMap((pkg) =>
    pkg.dependencies.flatMap(({ name, kinds }): ModuleImport[] => {
      const target = byName.get(name);
      if (
        target === undefined ||
        target === pkg ||
        !kinds.some((kind) => activeKinds.has(kind))
      )
        return [];
      return [
        {
          fromFile: `${pkg.path}/package.json`,
          fromModule: pkg.path,
          toFile: `${target.path}/package.json`,
          toModule: target.path,
          verdict: inCycle.has(`${pkg.name}->${name}`)
            ? { kind: 'violation', reason: 'no-rule', remedy: 'none' }
            : // A Package dependency needs no permission: it is simply allowed.
              { kind: 'rule', rule: { from: pkg.path, to: target.path } },
        },
      ];
    }),
  );

  const changeIndex =
    changes === undefined
      ? undefined
      : packageChangeIndex(
          analysis.packages.map(({ path }) => path),
          deleted,
          groups,
          changes,
          knownFiles,
        );

  const firstCycle = analysis.violations[0]?.packages[0];
  return {
    analysis: {
      config: noConfig,
      tree: { root: '.', nodes, owners: {} },
      imports,
      findings: [],
    },
    changeIndex,
    packages,
    folderOf: (cardPath) => cardPath,
    deleted,
    groups,
    findings: [
      {
        count: analysis.violations.length,
        one: 'Package cycle',
        many: 'Package cycles',
        short: 'cycles',
        alarm: true,
        first:
          firstCycle === undefined ? undefined : byName.get(firstCycle)?.path,
        title: analysis.violations
          .map(({ packages }) => [...packages, packages[0]].join(' → '))
          .join('\n'),
      },
    ],
  };
}
