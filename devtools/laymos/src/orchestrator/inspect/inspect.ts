import { Data, Effect } from 'effect';
import { NodeServices } from '@effect/platform-node';

import type {
  ArchitectureAnalysis,
  ModuleImport,
  TreeNode,
} from '../../architecture-analysis-schema/index.js';
import { analyzeArchitecture } from '../../domain/architecture-analysis/index.js';
import {
  fileDependencies,
  type FileDependency,
  type FileInspectionOptions,
} from '../../domain/file-graph/index.js';
import {
  expandRules,
  reachOf,
  type Reach,
} from '../../domain/import-law/index.js';
import { nodeByPath } from '../../domain/module-tree/index.js';
import { ConfigServiceLive } from '../../services/config/index.js';
import { CruiserLive } from '../../services/file-cruiser/index.js';
import { analyzeProject } from '../analyze-project/index.js';
import { loadProject } from '../load-project/index.js';

export class InspectionTargetNotFound extends Data.TaggedError(
  'InspectionTargetNotFound',
)<{
  readonly target: string;
  readonly targetKind: 'file' | 'module';
}> {}

export interface FileInspection {
  readonly path: string;
  // The node owning the file: a Module, or a Wrapper for an uncovered file.
  readonly owner: string;
  readonly role: 'index' | 'own' | 'uncovered';
  readonly dependencies: readonly FileDependency[];
  readonly recursive: boolean;
}

export interface ModuleInspection {
  readonly node: TreeNode;
  readonly reach: Reach;
  // Nodes whose files import this node's Index, and nodes this node imports.
  readonly dependents: readonly string[];
  readonly dependencies: readonly string[];
  // Every classified import this node is a side of.
  readonly imports: readonly ModuleImport[];
  readonly hasViolations: boolean;
}

export type ProjectInspection = ArchitectureAnalysis;

export function inspectProject(configPath: string) {
  return analyzeProject(configPath);
}

export function inspectFile(
  configPath: string,
  target: string,
  options: FileInspectionOptions = {},
) {
  return loadProject(configPath).pipe(
    Effect.flatMap(({ config, fileGraph }) =>
      Effect.gen(function* () {
        if (!fileGraph.has(target)) {
          return yield* new InspectionTargetNotFound({
            target,
            targetKind: 'file',
          });
        }
        const analysis = analyzeArchitecture(fileGraph, config);
        const owner = analysis.tree.owners[target]!;
        const node = nodeByPath(analysis.tree, owner)!;
        return {
          path: target,
          owner,
          role:
            node.kind === 'wrapper'
              ? 'uncovered'
              : node.index === target
                ? 'index'
                : 'own',
          dependencies: fileDependencies(fileGraph, target, options),
          recursive: options.recursive ?? false,
        } satisfies FileInspection;
      }),
    ),
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
  );
}

export function inspectModule(configPath: string, target: string) {
  return loadProject(configPath).pipe(
    Effect.flatMap(({ config, fileGraph }) =>
      Effect.gen(function* () {
        const analysis = analyzeArchitecture(fileGraph, config);
        const node = nodeByPath(analysis.tree, target);
        if (node === undefined) {
          return yield* new InspectionTargetNotFound({
            target,
            targetKind: 'module',
          });
        }
        return buildModuleInspection(analysis, node);
      }),
    ),
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
  );
}

function buildModuleInspection(
  analysis: ArchitectureAnalysis,
  node: TreeNode,
): ModuleInspection {
  const within = (path: string) =>
    path === node.path || path.startsWith(`${node.path}/`) || node.path === '.';
  const imports = analysis.imports.filter(
    ({ fromModule, toModule }) => within(fromModule) || within(toModule),
  );
  const law = {
    tree: analysis.tree,
    rules: expandRules(analysis.config, analysis.tree),
    exceptions: analysis.config.exceptions,
  };
  return {
    node,
    reach: reachOf(law, node.path),
    dependents: uniqueSorted(
      imports
        .filter(
          ({ fromModule, toModule }) => within(toModule) && !within(fromModule),
        )
        .map(({ fromModule }) => fromModule),
    ),
    dependencies: uniqueSorted(
      imports
        .filter(
          ({ fromModule, toModule }) => within(fromModule) && !within(toModule),
        )
        .map(({ toModule }) => toModule),
    ),
    imports,
    hasViolations: imports.some(({ verdict }) => verdict.kind === 'violation'),
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
