/** Focused consumers use this member for renderer-neutral Layer analysis. */
export { analyzeLayers } from './layers.js';
/** Module analysis builds a Layer context before resolving Module permissions. */
export { buildLayerContext } from './layers.js';
/** Module analysis names the Layer facts it reads while classifying imports. */
export type { LayerContext } from './layers.js';
/** Renderers use this to consume Layer analysis without changing it. */
export type {
  LayerAnalysis,
  LayerDefinition,
} from '../../../architecture-analysis-schema/index.js';
