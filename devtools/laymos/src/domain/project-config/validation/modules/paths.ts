import type { Config, ConfigValidationIssue } from '../../project-config.js';
import { isCanonicalPath } from '../containment.js';

export function findModulePathIssues(
  config: Config,
): readonly ConfigValidationIssue[] {
  return Object.entries(config.layers).flatMap(([layer, definition]) => [
    ...Object.keys(definition.modules)
      .filter((root) => !isCanonicalPath(root, true))
      .map((root) => ({
        kind: 'path' as const,
        message: `layers.${layer}.modules key must be a canonical project-relative file or directory: ${JSON.stringify(root)}`,
      })),
    ...Object.entries(definition.moduleGraphs).flatMap(([id, graph]) => [
      ...(isCanonicalPath(graph.path, true)
        ? []
        : [
            {
              kind: 'path' as const,
              message: `layers.${layer}.moduleGraphs.${id}.path must be a canonical project-relative directory: ${JSON.stringify(graph.path)}`,
            },
          ]),
      ...Object.keys(graph.modules)
        .filter((member) => !isCanonicalPath(member, false))
        .map((member) => ({
          kind: 'path' as const,
          message: `Module Graph ${id} member key must be a canonical path below its Graph root: ${JSON.stringify(member)}`,
        })),
    ]),
  ]);
}
