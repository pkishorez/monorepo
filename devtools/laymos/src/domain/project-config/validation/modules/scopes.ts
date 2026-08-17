import type { Config, ConfigValidationIssue } from '../../project-config.js';
import type { ResolvedConfig } from '../../resolve.js';
import { contains } from '../containment.js';

export function findScopeIssues(
  config: Config,
  resolved: ResolvedConfig,
): readonly ConfigValidationIssue[] {
  return [
    ...Object.entries(resolved.modules).flatMap(([root, definition]) =>
      scopeIssues(config, `Module ${root}`, root, definition.layer),
    ),
    ...Object.entries(resolved.graphs).flatMap(([id, graph]) =>
      scopeIssues(config, `Module Graph ${id}`, graph.path, graph.layer),
    ),
  ];
}

function scopeIssues(
  config: Config,
  subject: string,
  path: string,
  layer: string,
): readonly ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];
  const scopes = config.layers[layer]?.paths ?? [];
  if (!scopes.some((scope) => contains(scope, path))) {
    issues.push({
      kind: 'module',
      message: `${subject} is not contained by a scope of its Layer ${layer}`,
    });
  }
  const foreign = Object.entries(config.layers).find(
    ([id, definition]) =>
      id !== layer && definition.paths.some((scope) => contains(scope, path)),
  );
  if (foreign !== undefined) {
    issues.push({
      kind: 'module',
      message: `${subject} is declared in Layer ${layer} but falls inside Layer ${foreign[0]}`,
    });
  }
  if (config.ignoredPaths.some((ignored) => contains(ignored, path))) {
    issues.push({ kind: 'module', message: `${subject} is wholly ignored` });
  }
  return issues;
}
