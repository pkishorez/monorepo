import type { Config, ConfigValidationIssue } from '../../project-config.js';

export function findContainmentIssues(
  config: Config,
): readonly ConfigValidationIssue[] {
  return Object.keys(config.modules).flatMap((root) => {
    const layerScopes = Object.entries(config.layers).flatMap(
      ([layer, definition]) =>
        definition.paths
          .filter((scope) => contains(scope, root))
          .map((scope) => ({ layer, scope })),
    );
    const issues: ConfigValidationIssue[] = [];
    if (layerScopes.length !== 1) {
      issues.push({
        kind: 'module',
        message: `Module ${root} must be contained by exactly one Layer scope`,
      });
    }
    if (config.ignoredPaths.some((ignored) => contains(ignored, root))) {
      issues.push({
        kind: 'module',
        message: `Module ${root} is wholly ignored`,
      });
    }
    return issues;
  });
}

function contains(parent: string, child: string): boolean {
  return parent === '.' || child === parent || child.startsWith(`${parent}/`);
}
