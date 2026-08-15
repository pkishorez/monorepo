import type { ProjectInspection } from '../../../orchestrator/inspect/index.js';

export function renderProjectInspection(inspection: ProjectInspection): string {
  const modules = inspection.moduleAnalysis.modules;
  const counts = { normal: 0, shared: 0, entry: 0 };
  for (const module of modules) counts[module.kind] += 1;
  const layerViolations =
    inspection.layerAnalysis.unassignedFiles.length +
    inspection.layerAnalysis.forbiddenImports.length +
    inspection.layerAnalysis.layersWithoutModules.length;
  return [
    `Layers: ${Object.keys(inspection.config.layers).length}`,
    `Modules: ${modules.length} (${counts.normal} Normal, ${counts.shared} Shared, ${counts.entry} Entry)`,
    `Layer violations: ${layerViolations}`,
    `Module violations: ${inspection.moduleAnalysis.violations.length}`,
  ].join('\n');
}
