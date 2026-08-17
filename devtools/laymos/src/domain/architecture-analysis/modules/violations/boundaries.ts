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
  const dependencies = new Map<string, ModuleDependency>();
  const edges = new Map<string, Set<string>>();
  for (const [fromFile, fileDependencies] of [
    ...context.fileGraph.entries(),
  ].sort(([left], [right]) => left.localeCompare(right))) {
    const fromModule = context.membership.get(fromFile);
    if (fromModule === undefined) continue;
    for (const toFile of [...fileDependencies].sort()) {
      const toModule = context.membership.get(toFile);
      if (toModule === undefined || toModule === fromModule) continue;
      const toEntryPoint = context.entryPoints.has(toFile) ? toFile : undefined;
      const classification = classifyDependency(
        context,
        fromFile,
        toFile,
        fromModule,
        toModule,
      );
      const key = `${fromModule}\0${toModule}\0${toEntryPoint ?? ''}`;
      const permitted =
        classification === 'permitted' && toEntryPoint !== undefined;
      dependencies.set(key, {
        fromModule,
        toModule,
        ...(toEntryPoint === undefined ? {} : { toEntryPoint }),
        permitted: permitted || (dependencies.get(key)?.permitted ?? false),
      });
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
      const destinations = edges.get(fromModule) ?? new Set<string>();
      destinations.add(toModule);
      edges.set(fromModule, destinations);
    }
  }
  return {
    violations,
    dependencies: [...dependencies.values()],
    edges,
  };
}
