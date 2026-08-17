import type { ArchitectureAnalysis, ChangeSet } from 'laymos';

import { indexChanges, type ChangeIndex } from './changes';

import type { NamedLayerGraph } from './layers/layer-graphs';
import { combineLayerGraphRules } from './layers/layer-graphs';
import type {
  Layer,
  LayerCoverageViolation,
  LayerViolationPair,
} from './layers/model';
import type {
  Module,
  ModuleDependency,
  ModuleViolation,
} from './modules/model';

export interface LaymosPresentationModel {
  readonly layers: readonly Layer[];
  readonly layerGraphs: readonly NamedLayerGraph[];
  readonly rules: ReturnType<typeof combineLayerGraphRules>;
  readonly layerViolationPairs: readonly LayerViolationPair[];
  readonly layerCoverageViolations: readonly LayerCoverageViolation[];
  readonly modules: readonly Module[];
  readonly moduleDependencies: readonly ModuleDependency[];
  readonly moduleViolations: readonly ModuleViolation[];
  readonly changes?: ChangeIndex;
}

export function buildPresentationModel(
  analysis: ArchitectureAnalysis,
  changeSet?: ChangeSet,
): LaymosPresentationModel {
  const changes =
    changeSet === undefined ? undefined : indexChanges(analysis, changeSet);
  const modulePaths = new Set(
    analysis.moduleAnalysis.modules.map(({ path }) => path),
  );
  const layers = Object.entries(analysis.config.layers).map(
    ([id, definition]) => ({
      id,
      ...(definition.description === undefined
        ? {}
        : { description: definition.description }),
      ...changeStatusOf(changes?.layers, id),
      scopes: definition.paths.map((path) => ({
        path,
        fileCount: countScopeFiles(analysis.layerAnalysis.membership, id, path),
      })),
    }),
  );
  const layerGraphs = Object.entries(analysis.config.layerGraphs).map(
    ([id, graph]) => ({
      id,
      ...(graph.description === undefined
        ? {}
        : { description: graph.description }),
      rules: Object.entries(graph.rules).map(([fromLayerId, toLayerIds]) => ({
        fromLayerId,
        toLayerIds,
      })),
    }),
  );

  return {
    ...(changes === undefined ? {} : { changes }),
    layers,
    layerGraphs,
    rules: combineLayerGraphRules(layerGraphs),
    layerViolationPairs: layerViolationPairs(analysis),
    layerCoverageViolations: analysis.layerAnalysis.unassignedFiles.map(
      (file) => ({ file }),
    ),
    modules: analysis.moduleAnalysis.modules.map((module) => ({
      id: module.path,
      layerId: module.layer,
      ...changeStatusOf(changes?.modules, module.path),
      shared: module.kind === 'shared',
      kind: module.observedKind,
      configuredKind: module.kind,
      shape: module.shape,
      ...(module.kind === 'entry' ? { unexposed: true } : {}),
      nested: module.subpaths.map((path) => ({
        id: `${module.path}/${path}`,
        path,
      })),
    })),
    moduleDependencies: analysis.moduleAnalysis.dependencies.map(
      (dependency) => ({
        fromModuleId: dependency.fromModule,
        toModuleId: dependency.toModule,
        toEntryPointId:
          dependency.toEntryPoint === undefined
            ? dependency.toModule
            : entryPointId(dependency.toEntryPoint, modulePaths),
      }),
    ),
    moduleViolations: analysis.moduleAnalysis.violations.map((violation) => {
      const id = JSON.stringify(violation);
      switch (violation.kind) {
        case 'coverage':
          return {
            id,
            kind: violation.kind,
            file: violation.file,
            layerId:
              analysis.layerAnalysis.membership.get(violation.file) ?? '',
          };
        case 'missing-entry-point':
          return {
            id,
            kind: violation.kind,
            moduleId: violation.module,
            entryPointId: entryPointId(violation.path, modulePaths),
            path: violation.path,
          };
        case 'dependency':
        case 'boundary':
          return {
            id,
            kind: violation.kind,
            fromModuleId: violation.fromModule,
            toModuleId: violation.toModule,
            fromFile: violation.fromFile,
            toFile: violation.toFile,
          };
        case 'cycle':
          return {
            id,
            kind: violation.kind,
            moduleIds: violation.modules,
          };
        case 'unused-shared':
          return {
            id,
            kind: violation.kind,
            moduleId: violation.module,
          };
      }
    }),
  };
}

function countScopeFiles(
  membership: ReadonlyMap<string, string>,
  layerId: string,
  scope: string,
): number {
  return [...membership].filter(
    ([file, member]) => member === layerId && contains(scope, file),
  ).length;
}

function contains(scope: string, file: string): boolean {
  return scope === '.' || file === scope || file.startsWith(`${scope}/`);
}

function layerViolationPairs(
  analysis: ArchitectureAnalysis,
): readonly LayerViolationPair[] {
  const grouped = new Map<string, LayerViolationPair>();
  for (const violation of analysis.layerAnalysis.forbiddenImports) {
    const id = JSON.stringify([
      'layer-pair',
      violation.fromLayer,
      violation.toLayer,
    ]);
    const current = grouped.get(id);
    grouped.set(id, {
      id,
      fromLayerId: violation.fromLayer,
      toLayerId: violation.toLayer,
      violations: [
        ...(current?.violations ?? []),
        { fromFile: violation.fromFile, toFile: violation.toFile },
      ],
    });
  }
  return [...grouped.values()];
}

// A File Module's path may itself end in /index.ts; its id must stay the full path.
function entryPointId(path: string, modulePaths: ReadonlySet<string>): string {
  const suffix = '/index.ts';
  return !modulePaths.has(path) && path.endsWith(suffix)
    ? path.slice(0, -suffix.length)
    : path;
}

function changeStatusOf(
  statuses: ReadonlyMap<string, 'added' | 'modified'> | undefined,
  id: string,
): { readonly changeStatus?: 'added' | 'modified' } {
  const changeStatus = statuses?.get(id);
  return changeStatus === undefined ? {} : { changeStatus };
}
