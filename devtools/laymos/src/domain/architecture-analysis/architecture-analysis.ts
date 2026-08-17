import type {
  ArchitectureAnalysis,
  Config,
} from '../../architecture-analysis-schema/index.js';
import type { FileGraph } from '../file-graph/index.js';
import { resolveConfig } from '../project-config/index.js';
import { analyzeLayers } from './layers/index.js';
import { combineLayerRules } from './layer-rules.js';
import { analyzeModules } from './modules/index.js';

export function analyzeArchitecture(
  fileGraph: FileGraph,
  config: Config,
): ArchitectureAnalysis {
  const resolved = resolveConfig(config);
  const layerAnalysis = analyzeLayers(
    fileGraph,
    config.layers,
    combineLayerRules(config),
    resolved.modules,
  );
  return {
    config,
    layerAnalysis,
    moduleAnalysis: analyzeModules(fileGraph, resolved, layerAnalysis, config),
  };
}
