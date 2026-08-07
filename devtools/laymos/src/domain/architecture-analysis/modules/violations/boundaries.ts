import type {
  ModuleAnalysisContext,
  ModuleDependency,
  ModuleViolation,
} from '../modules.js';
import { classifyDependency } from './dependencies.js';

export interface ImportFindings {
  readonly violations: readonly ModuleViolation[];
  readonly dependencies: readonly ModuleDependency[];
  readonly edges: ReadonlyMap<string, ReadonlySet<string>>;
}

export function findBoundaryAndDependencyViolations(
  context: ModuleAnalysisContext,
): ImportFindings {
  const violations: ModuleViolation[] = [];
  const validDependencies = new Map<string, ModuleDependency>();
  const edges = new Map<string, Set<string>>();
  for (const [fromFile, fileDependencies] of [
    ...context.fileGraph.entries(),
  ].sort(([left], [right]) => left.localeCompare(right))) {
    const fromModule = context.membership.get(fromFile);
    if (fromModule === undefined) continue;
    for (const toFile of [...fileDependencies].sort()) {
      const toModule = context.membership.get(toFile);
      if (toModule === undefined || toModule === fromModule) continue;
      const classification = classifyDependency(
        context,
        fromFile,
        toFile,
        fromModule,
        toModule,
      );
      const importDetails = { fromFile, fromModule, toFile, toModule };
      if (classification === 'skip') continue;
      if (classification === 'dependency-violation') {
        violations.push({ kind: 'dependency', ...importDetails });
        continue;
      }
      if (!context.entryPoints.has(toFile)) {
        violations.push({ kind: 'boundary', ...importDetails });
        continue;
      }
      const dependency = {
        fromModule,
        toModule,
        toEntryPoint: toFile,
      };
      validDependencies.set(
        `${fromModule}\0${toModule}\0${toFile}`,
        dependency,
      );
      const destinations = edges.get(fromModule) ?? new Set<string>();
      destinations.add(toModule);
      edges.set(fromModule, destinations);
    }
  }
  return {
    violations,
    dependencies: [...validDependencies.values()],
    edges,
  };
}
