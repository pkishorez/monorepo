import type { FileGraph } from '../../file-graph/index.js';
import type { AllowedDependencies } from './allowed-dependencies.js';
import type { ForbiddenImport } from './layers.js';

export function findDependencyViolations(
  fileGraph: FileGraph,
  membership: ReadonlyMap<string, string>,
  allowedDependencies: AllowedDependencies,
): readonly ForbiddenImport[] {
  const violations: ForbiddenImport[] = [];

  for (const [fromFile, dependencies] of [...fileGraph.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const fromLayer = membership.get(fromFile);
    if (fromLayer === undefined) continue;
    for (const toFile of [...dependencies].sort()) {
      const toLayer = membership.get(toFile);
      if (
        toLayer === undefined ||
        toLayer === fromLayer ||
        allowedDependencies.get(fromLayer)?.has(toLayer)
      ) {
        continue;
      }
      violations.push({ fromFile, fromLayer, toFile, toLayer });
    }
  }

  return violations;
}
