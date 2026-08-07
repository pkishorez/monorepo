import type { FileGraph } from '../file-graph/index.js';
import { analyzeLayers, type LayerAnalysis } from './layers/index.js';
import type { LayerDefinition } from './layers/layers.js';
import { analyzeModules, type ModuleAnalysis } from './modules/index.js';
import type { ModuleDefinition } from './modules/modules.js';

export interface ArchitectureAnalysis {
  readonly layers: LayerAnalysis;
  readonly modules: ModuleAnalysis;
}

export function analyzeArchitecture(
  fileGraph: FileGraph,
  layers: Readonly<Record<string, LayerDefinition>>,
  modules: Readonly<Record<string, ModuleDefinition>>,
  layerRules: Readonly<Record<string, readonly string[]>>,
): ArchitectureAnalysis {
  const layerAnalysis = analyzeLayers(fileGraph, layers, layerRules);
  return {
    layers: layerAnalysis,
    modules: analyzeModules(fileGraph, modules, layerAnalysis, layers),
  };
}
