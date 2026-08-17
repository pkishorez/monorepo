import type { ConfigValidationIssue } from '../../project-config.js';
import type { ResolvedConfig } from '../../resolve.js';
import { overlaps } from '../containment.js';

export function findModuleOverlaps(
  resolved: ResolvedConfig,
): readonly ConfigValidationIssue[] {
  const roots = Object.keys(resolved.modules).sort();
  const issues: ConfigValidationIssue[] = [];
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      const first = roots[left]!;
      const second = roots[right]!;
      if (!overlaps(first, second)) continue;
      issues.push({
        kind: 'overlap',
        message: `Module roots overlap: ${first} and ${second}`,
      });
    }
  }
  const graphs = Object.entries(resolved.graphs).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  for (let left = 0; left < graphs.length; left += 1) {
    for (let right = left + 1; right < graphs.length; right += 1) {
      const [firstId, first] = graphs[left]!;
      const [secondId, second] = graphs[right]!;
      if (!overlaps(first.path, second.path)) continue;
      issues.push({
        kind: 'overlap',
        message: `Module Graph roots overlap: ${firstId} and ${secondId}`,
      });
    }
  }
  for (const [id, graph] of graphs) {
    const memberPaths = new Set(Object.values(graph.members));
    const intruder = roots.find(
      (root) =>
        !memberPaths.has(root) &&
        resolved.modules[root]?.graph === undefined &&
        overlaps(graph.path, root),
    );
    if (intruder === undefined) continue;
    issues.push({
      kind: 'overlap',
      message: `Module ${intruder} overlaps Module Graph ${id}`,
    });
  }
  return issues;
}
