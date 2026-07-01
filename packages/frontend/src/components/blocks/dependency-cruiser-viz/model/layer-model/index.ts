import type { VisualizationConfig, VizSummary } from '../types';
import { allModules, type ModuleNode } from '../modules';

export {
  buildLayerCardGroups,
  chipKeys,
  type ChipGroup,
  type ModuleChip,
} from './layer-cards';

/** A layer's identity key, equal to its bare name. */
export function scopedLayer(_group: string | undefined, name: string): string {
  return name;
}

export type LayerSection = {
  /** Layer identity key (matches the canvas node id). */
  key: string;
  /** Bare display name. */
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

type LayerMeta = { name: string; paths: string[] };

/**
 * Builds a render-agnostic layer model: an ordered list of slots (columns),
 * each with one or more sections (one per unique layer at that level).
 * Layers shared within a group produce a single section; the same name in a
 * different group is a distinct section.
 */
export function buildLayerModel(
  config: VisualizationConfig,
  summary?: VizSummary,
): LayerModel {
  const levels = computeLevels(config.stacks);
  const modulesByLayer = groupModulesByLayer(config, summary);
  const layerMeta = mergeLayerMeta(config);

  // Collect keys by level; within a level maintain stack-order (stable)
  const byLevel = new Map<number, string[]>();
  for (const [key, level] of levels) {
    const list = byLevel.get(level);
    if (list) {
      if (!list.includes(key)) list.push(key);
    } else {
      byLevel.set(level, [key]);
    }
  }

  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);

  const slots: LayerSlot[] = sortedLevels.map((level, idx) => {
    const keys = byLevel.get(level)!;
    const sections: LayerSection[] = keys.map((key) => {
      const meta = layerMeta.get(key);
      return {
        key,
        layer: meta?.name ?? key,
        paths: meta?.paths ?? [],
        modules: modulesByLayer.get(key) ?? [],
      };
    });
    return { index: idx, sections };
  });

  return { slots };
}

export type LayerGridCard = {
  /** Layer identity key (matches the canvas node id). */
  key: string;
  /** Bare display name. */
  layer: string;
  paths: readonly string[];
  modules: ModuleNode[];
  /** Dependency level — the 0-based grid column. */
  column: number;
  /** 0-based first stack row this layer belongs to. */
  rowStart: number;
  /** Stack rows the card spans (contiguous min..max of its stacks). */
  rowSpan: number;
  /** Names of the stacks containing this layer, in row order. */
  stacks: string[];
};

export type LayerGrid = {
  /** Stack names — one grid row band each. */
  stackRows: string[];
  columnCount: number;
  cards: LayerGridCard[];
};

/**
 * Builds the stack-aware grid for the Features tab: one row band per stack,
 * columns by dependency level. A layer shared across stacks yields a single
 * card spanning those stacks' rows.
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
      const key = scopedLayer(undefined, layer.name);
      const rows = rowsByLayer.get(key);
      if (rows) rows.push(row);
      else rowsByLayer.set(key, [row]);
    }
  });

  const cards: LayerGridCard[] = [...rowsByLayer.entries()].map(
    ([key, rows]) => {
      const rowStart = Math.min(...rows);
      const meta = layerMeta.get(key);
      return {
        key,
        layer: meta?.name ?? key,
        paths: meta?.paths ?? [],
        modules: modulesByLayer.get(key) ?? [],
        column: levels.get(key) ?? 0,
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
    const key = scopedLayer(undefined, m.layer);
    const list = byLayer.get(key);
    if (list) list.push(m);
    else byLayer.set(key, [m]);
  }
  return byLayer;
}

/** Layer meta (bare name, paths) keyed by layer name, merged across stacks. */
function mergeLayerMeta(config: VisualizationConfig): Map<string, LayerMeta> {
  const meta = new Map<string, LayerMeta>();
  for (const stack of config.stacks) {
    for (const layer of stack.layers) {
      const key = scopedLayer(undefined, layer.name);
      const entry = meta.get(key);
      if (entry) {
        for (const p of layer.paths) {
          if (!entry.paths.includes(p)) entry.paths.push(p);
        }
      } else {
        meta.set(key, { name: layer.name, paths: [...layer.paths] });
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
    const keys = stack.layers.map((l) => scopedLayer(undefined, l.name));
    for (const key of keys) {
      if (!predecessors.has(key)) predecessors.set(key, new Set());
    }
    for (let i = 1; i < keys.length; i++) {
      predecessors.get(keys[i]!)!.add(keys[i - 1]!);
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
