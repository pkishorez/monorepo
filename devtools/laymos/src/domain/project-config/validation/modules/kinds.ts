import type { Config, ConfigValidationIssue } from '../../project-config.js';

export function findAllSharedLayerIssues(
  config: Config,
): readonly ConfigValidationIssue[] {
  return Object.entries(config.layers).flatMap(([layer, definition]) => {
    const modules = Object.entries(config.modules).filter(([root]) =>
      definition.paths.some((scope) => contains(scope, root)),
    );
    if (
      modules.length === 0 ||
      modules.some(([, module]) => module.kind !== 'shared')
    ) {
      return [];
    }
    return [
      {
        kind: 'module' as const,
        message: `Layer ${layer} cannot contain only Shared Modules`,
      },
    ];
  });
}

function contains(parent: string, child: string): boolean {
  return parent === '.' || child === parent || child.startsWith(`${parent}/`);
}
