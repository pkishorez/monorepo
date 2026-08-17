import type { AnalyzedModule } from '../../../architecture-analysis-schema/index.js';
import type { LayerInspection } from '../../../orchestrator/inspect/index.js';

export function renderLayerInspection(inspection: LayerInspection): string {
  return [
    `Layer: ${inspection.id}`,
    `Paths: ${inspection.definition.paths.join(', ')}`,
    `May depend on: ${inspection.allowedDependencies.join(', ') || 'none'}`,
    `Used by: ${inspection.allowedDependents.join(', ') || 'none'}`,
    `Modules: ${inspection.modules.length}`,
    `Shared: ${inspection.sharedCount}`,
    `Module Graphs: ${inspection.moduleGraphs.length}`,
    'Module list:',
    ...inspection.modules.map(
      (module) =>
        `  ${module.path} (${visibility(module)}, ${module.shape}, ${module.observedKind}${module.graph === undefined ? '' : `, graph ${module.graph}`})`,
    ),
    `Violations: ${inspection.layerViolations.length + inspection.moduleViolations.length + Number(inspection.hasNoModules)}`,
  ].join('\n');
}

function visibility(module: AnalyzedModule): string {
  const flags = [
    ...(module.shared ? ['shared'] : []),
    ...(module.exposed ? ['exposed'] : []),
  ];
  return flags.length === 0 ? 'private' : flags.join('+');
}
