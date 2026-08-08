import type { ModuleDefinition } from '../../../architecture-analysis-schema/index.js';
import type { LayerDefinition } from './layers.js';

export function findLayersWithoutModules(
  layers: Readonly<Record<string, LayerDefinition>>,
  modules: Readonly<Record<string, ModuleDefinition>>,
): readonly string[] {
  const modulePaths = Object.keys(modules);
  return Object.entries(layers)
    .filter(([, definition]) =>
      definition.paths.every(
        (scope) =>
          !modulePaths.some(
            (modulePath) =>
              scope === '.' ||
              modulePath === scope ||
              modulePath.startsWith(`${scope}/`),
          ),
      ),
    )
    .map(([layer]) => layer)
    .sort((left, right) => left.localeCompare(right));
}
