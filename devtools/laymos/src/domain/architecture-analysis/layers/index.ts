/** Focused consumers use this nested door for renderer-neutral Layer analysis. */
export { analyzeLayers } from './layers.js';
/** Renderers use this to consume Layer analysis without changing it. */
export type {
  LayerAnalysis,
  LayerDefinition,
} from '../../../architecture-analysis-schema/index.js';
