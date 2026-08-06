// Orchestrators use this to evaluate a validated Layer policy against a FileGraph.
export { lintLayers } from './layers.js';
// Report renderers name the complete result returned by layer lint.
export type { LayerLintResult } from './layers.js';
