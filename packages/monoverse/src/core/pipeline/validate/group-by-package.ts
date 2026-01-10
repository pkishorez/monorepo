import type { MonorepoAnalysis, DependencySource } from '../analyze/types.js';
import type { PackageGroup, DependencyInstance } from './types.js';

export function groupDependenciesByPackage(
  analysis: MonorepoAnalysis,
  filterBySources: DependencySource[] = ['npm'],
): PackageGroup[] {
  const sourceSet = new Set(filterBySources);
  const grouped = new Map<string, DependencyInstance[]>();

  for (const workspace of analysis.workspaces) {
    for (const dep of workspace.dependencies) {
      if (!sourceSet.has(dep.source)) {
        continue;
      }

      const instance: DependencyInstance = {
        workspace: workspace.name,
        versionRange: dep.versionRange,
        type: dep.dependencyType,
      };

      const existing = grouped.get(dep.name);
      if (existing) {
        existing.push(instance);
      } else {
        grouped.set(dep.name, [instance]);
      }
    }
  }

  return Array.from(grouped.entries())
    .map(([name, instances]) => ({ name, instances }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
