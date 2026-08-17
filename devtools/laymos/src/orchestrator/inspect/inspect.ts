import { Data, Effect } from 'effect';
import { NodeServices } from '@effect/platform-node';

import type {
  AnalyzedModule,
  AnalyzedModuleGraph,
  ArchitectureAnalysis,
  ForbiddenImport,
  LayerDefinition,
  ModuleViolation,
} from '../../architecture-analysis-schema/index.js';
import { analyzeArchitecture } from '../../domain/architecture-analysis/index.js';
import { findModuleCycles } from '../../domain/architecture-analysis/modules/index.js';
import {
  fileDependencies,
  type FileDependency,
  type FileInspectionOptions,
} from '../../domain/file-graph/index.js';
import { ConfigServiceLive } from '../../services/config/index.js';
import { CruiserLive } from '../../services/file-cruiser/index.js';
import { analyzeProject } from '../analyze-project/index.js';
import { loadProject } from '../load-project/index.js';

export class InspectionTargetNotFound extends Data.TaggedError(
  'InspectionTargetNotFound',
)<{
  readonly target: string;
  readonly targetKind: 'file' | 'layer' | 'module';
}> {}

export class ModuleInspectionCycle extends Data.TaggedError(
  'ModuleInspectionCycle',
)<{
  readonly target: string;
}> {}

export interface FileInspection {
  readonly path: string;
  readonly layer: string | undefined;
  readonly module: string | undefined;
  readonly role: 'public-entry-point' | 'internal' | undefined;
  readonly dependencies: readonly FileDependency[];
  readonly recursive: boolean;
  readonly hasCoverageViolation: boolean;
}

export interface ModuleInspection {
  readonly module: AnalyzedModule;
  // Absent for a free-form Module; the member keys its Rules permit otherwise.
  readonly graphRules: readonly string[] | undefined;
  readonly publicEntryPoints: readonly string[];
  readonly dependents: readonly string[];
  readonly dependencies: readonly string[];
  readonly hasViolations: boolean;
}

export type ProjectInspection = ArchitectureAnalysis;

export interface LayerInspection {
  readonly id: string;
  readonly definition: LayerDefinition;
  readonly files: readonly string[];
  readonly allowedDependencies: readonly string[];
  readonly allowedDependents: readonly string[];
  readonly modules: readonly AnalyzedModule[];
  readonly moduleGraphs: readonly AnalyzedModuleGraph[];
  readonly sharedCount: number;
  readonly hasNoModules: boolean;
  readonly layerViolations: readonly ForbiddenImport[];
  readonly moduleViolations: readonly ModuleViolation[];
}

export function inspectProject(configPath: string) {
  return analyzeProject(configPath);
}

export function inspectLayer(configPath: string, target: string) {
  return inspectProject(configPath).pipe(
    Effect.flatMap((analysis) => {
      const definition = analysis.config.layers[target];
      if (definition === undefined) {
        return new InspectionTargetNotFound({
          target,
          targetKind: 'layer',
        });
      }
      const modules = analysis.moduleAnalysis.modules.filter(
        ({ layer }) => layer === target,
      );
      const modulePaths = new Set(modules.map(({ path }) => path));
      return Effect.succeed({
        id: target,
        definition,
        files: [...analysis.layerAnalysis.membership]
          .filter(([, layer]) => layer === target)
          .map(([file]) => file)
          .sort(),
        allowedDependencies: [
          ...(analysis.layerAnalysis.allowedDependencies.get(target) ?? []),
        ].sort(),
        allowedDependents: [...analysis.layerAnalysis.allowedDependencies]
          .filter(([, dependencies]) => dependencies.has(target))
          .map(([layer]) => layer)
          .sort(),
        modules,
        moduleGraphs: analysis.moduleAnalysis.graphs.filter(
          ({ layer }) => layer === target,
        ),
        sharedCount: modules.filter(({ shared }) => shared).length,
        hasNoModules:
          analysis.layerAnalysis.layersWithoutModules.includes(target),
        layerViolations: analysis.layerAnalysis.forbiddenImports.filter(
          ({ fromLayer, toLayer }) =>
            fromLayer === target || toLayer === target,
        ),
        moduleViolations: analysis.moduleAnalysis.violations.filter(
          (violation) =>
            ((violation.kind === 'coverage' ||
              violation.kind === 'graph-coverage') &&
              analysis.layerAnalysis.membership.get(violation.file) ===
                target) ||
            [...modulePaths].some((module) =>
              violationInvolvesModule(violation, module),
            ),
        ),
      } satisfies LayerInspection);
    }),
  );
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
        const layer = analysis.layerAnalysis.membership.get(target);
        const module = analysis.moduleAnalysis.membership.get(target);
        return {
          path: target,
          layer,
          module,
          role:
            module === undefined
              ? undefined
              : analysis.moduleAnalysis.entryPoints.has(target)
                ? 'public-entry-point'
                : 'internal',
          dependencies: fileDependencies(fileGraph, target, options),
          recursive: options.recursive ?? false,
          hasCoverageViolation: layer === undefined || module === undefined,
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
        const module = analysis.moduleAnalysis.modules.find(
          ({ path }) => path === target,
        );
        if (module === undefined) {
          return yield* new InspectionTargetNotFound({
            target,
            targetKind: 'module',
          });
        }
        if (participatesInCycle(analysis, target)) {
          return yield* new ModuleInspectionCycle({ target });
        }
        return buildModuleInspection(analysis, module);
      }),
    ),
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
  );
}

function buildModuleInspection(
  analysis: ArchitectureAnalysis,
  module: AnalyzedModule,
): ModuleInspection {
  const target = module.path;
  const dependencies = analysis.moduleAnalysis.dependencies;
  return {
    module,
    graphRules:
      module.graph === undefined || module.member === undefined
        ? undefined
        : (analysis.moduleAnalysis.graphs.find(({ id }) => id === module.graph)
            ?.rules[module.member] ?? []),
    publicEntryPoints: [...analysis.moduleAnalysis.entryPoints]
      .filter(
        (entryPoint) =>
          analysis.moduleAnalysis.membership.get(entryPoint) === target,
      )
      .sort(),
    dependents: uniqueSorted(
      dependencies
        .filter(({ toModule }) => toModule === target)
        .map(({ fromModule }) => fromModule),
    ),
    dependencies: uniqueSorted(
      dependencies
        .filter(({ fromModule }) => fromModule === target)
        .map(({ toModule }) => toModule),
    ),
    hasViolations: hasModuleViolations(analysis, target),
  };
}

function participatesInCycle(
  analysis: ArchitectureAnalysis,
  target: string,
): boolean {
  const edges = new Map<string, Set<string>>();
  for (const { fromModule, toModule } of analysis.moduleAnalysis.dependencies) {
    const destinations = edges.get(fromModule) ?? new Set<string>();
    destinations.add(toModule);
    edges.set(fromModule, destinations);
  }
  return findModuleCycles(edges).some((cycle) => cycle.includes(target));
}

function hasModuleViolations(
  analysis: ArchitectureAnalysis,
  target: string,
): boolean {
  const memberFiles = new Set(
    [...analysis.moduleAnalysis.membership]
      .filter(([, module]) => module === target)
      .map(([file]) => file),
  );
  return (
    analysis.moduleAnalysis.violations.some((violation) =>
      violationInvolvesModule(violation, target),
    ) ||
    analysis.layerAnalysis.forbiddenImports.some(
      ({ fromFile, toFile }) =>
        memberFiles.has(fromFile) || memberFiles.has(toFile),
    )
  );
}

function violationInvolvesModule(
  violation: ModuleViolation,
  target: string,
): boolean {
  if (
    violation.kind === 'missing-entry-point' ||
    violation.kind === 'unused-shared' ||
    violation.kind === 'dead-module'
  ) {
    return violation.module === target;
  }
  if (violation.kind === 'dependency' || violation.kind === 'boundary') {
    return violation.fromModule === target || violation.toModule === target;
  }
  return violation.kind === 'cycle' && violation.modules.includes(target);
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
