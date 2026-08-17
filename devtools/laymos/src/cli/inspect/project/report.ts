import type { ProjectInspection } from '../../../orchestrator/inspect/index.js';

export function renderProjectInspection(inspection: ProjectInspection): string {
  const modules = inspection.moduleAnalysis.modules;
  const shared = modules.filter((module) => module.shared).length;
  const exposed = modules.filter((module) => module.exposed).length;
  const members = modules.filter((module) => module.graph !== undefined).length;
  const layerViolations =
    inspection.layerAnalysis.unassignedFiles.length +
    inspection.layerAnalysis.forbiddenImports.length +
    inspection.layerAnalysis.layersWithoutModules.length;
  return [
    `Layers: ${Object.keys(inspection.config.layers).length}`,
    `Modules: ${modules.length} (${shared} Shared, ${exposed} exposed, ${members} in a Module Graph)`,
    `Module Graphs: ${inspection.moduleAnalysis.graphs.length}`,
    `Layer violations: ${layerViolations}`,
    `Module violations: ${inspection.moduleAnalysis.violations.length}`,
  ].join('\n');
}
