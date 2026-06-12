import type { VisualizationConfig, VizSummary } from '../../model';
import { featureFocus } from '../../model';
import type { ModuleNode } from '../../model';
import { buildLayerGrid, type LayerGrid } from '../../model/layer-model';

export type FilterChipId = 'shared-unowned' | 'breached' | 'public-surface';

export type FeatureChip = {
  kind: 'feature';
  id: string;
  label: string;
  ownedCount: number;
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
 * Feature chips are ordered by owned-module-count descending.
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
      ownedCount: focus.owned.size,
    };
  });

  featureChips.sort((a, b) => b.ownedCount - a.ownedCount);

  const filterChips: FilterChip[] = [
    { kind: 'filter', id: 'shared-unowned', label: 'Shared / Unowned' },
    { kind: 'filter', id: 'breached', label: 'Breached' },
    { kind: 'filter', id: 'public-surface', label: 'Public surface' },
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
    if (chipId === 'shared-unowned' && m.feature === null) keys.add(m.key);
    else if (chipId === 'breached' && m.isBreached) keys.add(m.key);
    else if (chipId === 'public-surface' && m.visibility === 'public')
      keys.add(m.key);
  }
  return keys;
}
