import type { VisualizationConfig, VizSummary } from '../../model';
import { featureFocus } from '../../model';
import type { ModuleNode } from '../../model';
import { buildLayerGrid, type LayerGrid } from '../../model/layer-model';

export type FilterChipId = 'shared' | 'breached';

export type FeatureChip = {
  kind: 'feature';
  id: string;
  label: string;
  memberCount: number;
};

export type FilterChip = {
  kind: 'filter';
  id: FilterChipId;
  label: string;
};

export type Chip = FeatureChip | FilterChip;

export type FeatureLayersModel = {
  layerGrid: LayerGrid;
  featureChips: FeatureChip[];
  filterChips: FilterChip[];
};

/**
 * Derives the chip bar contents from config + summary.
 * Feature chips are ordered by member-module-count descending.
 */
export function buildFeatureLayersModel(
  config: VisualizationConfig,
  summary?: VizSummary,
): FeatureLayersModel {
  const layerGrid = buildLayerGrid(config, summary);

  const featureChips: FeatureChip[] = (config.features ?? []).map((f) => {
    const focus = featureFocus(summary, f.name);
    return {
      kind: 'feature',
      id: f.name,
      label: f.name,
      memberCount: focus.members.size,
    };
  });

  featureChips.sort((a, b) => b.memberCount - a.memberCount);

  const filterChips: FilterChip[] = [
    { kind: 'filter', id: 'shared', label: 'Shared' },
    { kind: 'filter', id: 'breached', label: 'Breached' },
  ];

  return { layerGrid, featureChips, filterChips };
}

/**
 * Returns the set of module keys highlighted by a filter chip.
 */
export function filterChipModules(
  chipId: FilterChipId,
  allModuleNodes: ModuleNode[],
): Set<string> {
  const keys = new Set<string>();
  for (const m of allModuleNodes) {
    if (chipId === 'shared' && m.isShared) keys.add(m.key);
    else if (chipId === 'breached' && m.isBreached) keys.add(m.key);
  }
  return keys;
}
