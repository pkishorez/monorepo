import type { Config } from '../../config.js';
import type { ConfigValidationIssue } from '../../errors.js';
import { findCycles } from './cycles.js';
import { findOverlaps } from './overlaps.js';
import { findUnknownReferences } from './references.js';

export function validateLayers(
  config: Config,
): readonly ConfigValidationIssue[] {
  const overlaps = findOverlaps(config.layers);
  const references = findUnknownReferences(config.layers, config.layerGraphs);
  const cycles = references.length === 0 ? findCycles(config.layerGraphs) : [];
  return [...overlaps, ...references, ...cycles];
}
