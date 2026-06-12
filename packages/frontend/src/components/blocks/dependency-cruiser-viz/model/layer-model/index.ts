import type { VisualizationConfig, VizSummary } from '../types';
import { allModules, type ModuleNode } from '../modules';

export {
  buildLayerCardGroups,
  chipKeys,
  type ChipGroup,
  type ModuleChip,
} from './layer-cards';

export type LayerSection = {
  layer: string;
  paths: readonly string[];
  modules: ModuleNode[];
};

export type LayerSlot = {
  index: number;
  sections: LayerSection[];
};

export type LayerModel = {
  slots: LayerSlot[];
};

/**
 * Builds a render-agnostic layer model: an ordered list of slots (columns),
 * each with one or more sections (one per unique layer at that level).
 * Shared layers (appearing in multiple stacks) produce a single section.
 * Ordering matches the left-to-right layout used by the Layers tab.
 */
export function buildLayerModel(
  config: VisualizationConfig,
  summary?: VizSummary,
): LayerModel {
  const levels = computeLevels(config.stacks);
  const modulesByLayer = groupModulesByLayer(config, summary);
  const layerMeta = mergeLayerMeta(config);

  // Group layers by level; within a level maintain stack-order (stable)
  const byLevel = new Map<number, string[]>();
  for (const [name, level] of levels) {
    const list = byLevel.get(level);
    if (list) {
      if (!list.includes(name)) list.push(name);
    } else {
      byLevel.set(level, [name]);
    }
  }

  // Slots ordered by ascending level
  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);

  const slots: LayerSlot[] = sortedLevels.map((level, idx) => {
    const layers = byLevel.get(level)!;
    const sections: LayerSection[] = layers.map((layerName) => ({
      layer: layerName,
      paths: layerMeta.get(layerName)?.paths ?? [],
      modules: modulesByLayer.get(layerName) ?? [],
    }));
    return { index: idx, sections };
  });

  return { slots };
}

export type LayerGridCard = {
  layer: string;
  paths: readonly string[];
  modules: ModuleNode[];
  /** Dependency level — the 0-based grid column. */
  column: number;
  /** 0-based first stack row this layer belongs to. */
  rowStart: number;
  /** Stack rows the card spans (contiguous min..max of its stacks). */
  rowSpan: number;
  /** Names of the stacks containing this layer, in config order. */
  stacks: string[];
};

export type LayerGrid = {
  /** Stack names in config order — one grid row band each. */
  stackRows: string[];
  columnCount: number;
  cards: LayerGridCard[];
};

/**
 * Builds the stack-aware grid for the Features tab: one row band per stack,
 * columns by dependency level. A layer appearing in several stacks yields a
 * single card spanning those stacks' rows (min..max, so non-adjacent sharing
 * stacks also span the rows between them).
 */
export function buildLayerGrid(
  config: VisualizationConfig,
  summary?: VizSummary,
): LayerGrid {
  const levels = computeLevels(config.stacks);
  const modulesByLayer = groupModulesByLayer(config, summary);
  const layerMeta = mergeLayerMeta(config);

  const stackRows = config.stacks.map((s) => s.name);
  const rowsByLayer = new Map<string, number[]>();
  config.stacks.forEach((stack, row) => {
    for (const layer of stack.layers) {
      const rows = rowsByLayer.get(layer.name);
      if (rows) rows.push(row);
      else rowsByLayer.set(layer.name, [row]);
    }
  });

  const cards: LayerGridCard[] = [...rowsByLayer.entries()].map(
    ([name, rows]) => {
      const rowStart = Math.min(...rows);
      return {
        layer: name,
        paths: layerMeta.get(name)?.paths ?? [],
        modules: modulesByLayer.get(name) ?? [],
        column: levels.get(name) ?? 0,
        rowStart,
        rowSpan: Math.max(...rows) - rowStart + 1,
        stacks: rows.map((r) => stackRows[r]!),
      };
    },
  );

  cards.sort((a, b) => a.column - b.column || a.rowStart - b.rowStart);

  const columnCount = cards.reduce((max, c) => Math.max(max, c.column + 1), 0);

  return { stackRows, columnCount, cards };
}

function groupModulesByLayer(
  config: VisualizationConfig,
  summary?: VizSummary,
): Map<string, ModuleNode[]> {
  const byLayer = new Map<string, ModuleNode[]>();
  for (const m of allModules(config, summary)) {
    const list = byLayer.get(m.layer);
    if (list) list.push(m);
    else byLayer.set(m.layer, [m]);
  }
  return byLayer;
}

/** Layer meta (paths) merged across the stacks that declare the layer. */
function mergeLayerMeta(
  config: VisualizationConfig,
): Map<string, { paths: string[] }> {
  const meta = new Map<string, { paths: string[] }>();
  for (const stack of config.stacks) {
    for (const layer of stack.layers) {
      const entry = meta.get(layer.name);
      if (entry) {
        for (const p of layer.paths) {
          if (!entry.paths.includes(p)) entry.paths.push(p);
        }
      } else {
        meta.set(layer.name, { paths: [...layer.paths] });
      }
    }
  }
  return meta;
}

function computeLevels(
  stacks: VisualizationConfig['stacks'],
): Map<string, number> {
  const predecessors = new Map<string, Set<string>>();

  for (const stack of stacks) {
    for (const layer of stack.layers) {
      if (!predecessors.has(layer.name))
        predecessors.set(layer.name, new Set());
    }
    for (let i = 1; i < stack.layers.length; i++) {
      predecessors.get(stack.layers[i]!.name)!.add(stack.layers[i - 1]!.name);
    }
  }

  const levels = new Map<string, number>();

  function getLevel(name: string): number {
    if (levels.has(name)) return levels.get(name)!;
    const preds = predecessors.get(name);
    if (!preds || preds.size === 0) {
      levels.set(name, 0);
      return 0;
    }
    const level = Math.max(...[...preds].map(getLevel)) + 1;
    levels.set(name, level);
    return level;
  }

  for (const name of predecessors.keys()) {
    getLevel(name);
  }

  return levels;
}
