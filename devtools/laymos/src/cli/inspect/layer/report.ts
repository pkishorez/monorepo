import type { LayerInspection } from '../../../orchestrator/inspect/index.js';

export function renderLayerInspection(inspection: LayerInspection): string {
  return [
    `Layer: ${inspection.id}`,
    `Paths: ${inspection.definition.paths.join(', ')}`,
    `May depend on: ${inspection.allowedDependencies.join(', ') || 'none'}`,
    `Used by: ${inspection.allowedDependents.join(', ') || 'none'}`,
    `Modules: ${inspection.modules.length}`,
    `Shared: ${inspection.sharedCount}`,
    'Module list:',
    ...inspection.modules.map(
      (module) =>
        `  ${module.path} (${module.kind}, ${module.shape}, ${module.observedKind})`,
    ),
    `Violations: ${inspection.layerViolations.length + inspection.moduleViolations.length + Number(inspection.hasNoModules)}`,
  ].join('\n');
}
