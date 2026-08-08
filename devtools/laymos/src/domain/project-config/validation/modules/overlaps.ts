import type { Config, ConfigValidationIssue } from '../../project-config.js';

export function findModuleOverlaps(
  modules: Config['modules'],
): readonly ConfigValidationIssue[] {
  const roots = Object.keys(modules).sort();
  const issues: ConfigValidationIssue[] = [];
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      const first = roots[left]!;
      const second = roots[right]!;
      if (!contains(first, second) && !contains(second, first)) continue;
      issues.push({
        kind: 'overlap',
        message: `Module roots overlap: ${first} and ${second}`,
      });
    }
  }
  return issues;
}

function contains(parent: string, child: string): boolean {
  return parent === '.' || child === parent || child.startsWith(`${parent}/`);
}
