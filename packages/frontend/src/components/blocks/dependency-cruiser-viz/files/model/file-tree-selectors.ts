import {
  featureFiles,
  type VisualizationConfig,
  type VizSummary,
} from '../../model';
import type { CoverageStatItem, ViolationItem } from './file-tree-types';

export function getCoverageStats({
  summary,
  selectedLayer,
  selectedFeature,
}: {
  summary: VizSummary;
  selectedLayer: string | null;
  selectedFeature: string | null;
}): CoverageStatItem[] {
  if (selectedFeature) {
    const covered = featureFiles(summary, selectedFeature)?.size ?? 0;
    return [
      {
        key: 'covered',
        status: 'covered',
        count: covered,
        label: 'files in feature',
      },
    ];
  }

  const layerViolationCount = selectedLayer
    ? summary.violations.filter(
        (v) => v.from === selectedLayer || v.to === selectedLayer,
      ).length
    : summary.violations.length;
  const ignoredCount = summary.ignoredFiles.length;

  return [
    {
      key: 'violations',
      status: 'violation',
      count: layerViolationCount,
      label: layerViolationCount === 1 ? 'violation' : 'violations',
      hidden: layerViolationCount === 0,
    },
    {
      key: 'uncovered',
      status: 'orphan',
      count: summary.layerOrphanFiles.length,
      label: 'uncovered',
    },
    {
      key: 'covered',
      status: 'covered',
      count: summary.coveredFiles.reduce((sum, l) => sum + l.files.length, 0),
      label: 'covered',
    },
    {
      key: 'ignored',
      status: 'ignored',
      count: ignoredCount,
      label: 'ignored',
      hidden: ignoredCount === 0,
      muted: true,
    },
  ];
}

export function getViolations({
  summary,
  selectedLayer,
  selectedFeature,
}: {
  summary: VizSummary;
  selectedLayer: string | null;
  selectedFeature: string | null;
}): ViolationItem[] {
  if (selectedFeature) return [];
  if (selectedLayer) {
    return summary.violations.filter(
      (v) => v.from === selectedLayer || v.to === selectedLayer,
    );
  }
  return summary.violations;
}

/**
 * Resolve the file sets the tree should highlight.
 *
 * - With a selected feature, returns its two tiers — `owned` (strong) and
 *   `consumed` (subtle) — alongside their union as `all` (used for folder
 *   containment / dimming). When a layer is ALSO active, both tiers are
 *   intersected with that layer's files so the same layer-scoping applies.
 * - With only a layer selected, that layer's files become `owned` (the
 *   existing single-tier behavior) and `consumed` is null.
 * - With nothing selected, every field is null (no highlight).
 */
export function getHighlightedFiles({
  summary,
  selectedLayer,
  featureFileSets,
}: {
  summary: VizSummary;
  selectedLayer: string | null;
  featureFileSets: { owned: Set<string>; consumed: Set<string> } | null;
}): {
  all: Set<string> | null;
  owned: Set<string> | null;
  consumed: Set<string> | null;
} {
  if (featureFileSets) {
    let { owned, consumed } = featureFileSets;
    if (selectedLayer) {
      const layerEntry = summary.coveredFiles.find(
        (c) => c.layer === selectedLayer,
      );
      if (layerEntry) {
        const layerFiles = new Set(layerEntry.files);
        owned = new Set([...owned].filter((f) => layerFiles.has(f)));
        consumed = new Set([...consumed].filter((f) => layerFiles.has(f)));
      }
    }
    if (owned.size === 0 && consumed.size === 0) {
      return { all: null, owned: null, consumed: null };
    }
    return {
      all: new Set([...owned, ...consumed]),
      owned,
      consumed,
    };
  }
  if (!selectedLayer) return { all: null, owned: null, consumed: null };
  const entry = summary.coveredFiles.find((c) => c.layer === selectedLayer);
  if (!entry) return { all: null, owned: null, consumed: null };
  const owned = new Set(entry.files);
  return { all: owned, owned, consumed: null };
}

/**
 * Files in a declared layer but in no declared module (feature-independent
 * coverage gaps), straight from the summary.
 */
export function getCoverageGapFiles(summary: VizSummary): Set<string> {
  return new Set(summary.coverageGaps);
}

/**
 * Coverage gaps grouped by their owning layer, for the bottom-pinned dialog.
 */
export function getCoverageGapsByLayer(
  summary: VizSummary,
): Array<{ layer: string; files: string[] }> {
  const layerOf = new Map<string, string>();
  for (const { layer, files } of summary.coveredFiles) {
    for (const f of files) layerOf.set(f, layer);
  }
  const byLayer = new Map<string, string[]>();
  for (const f of summary.coverageGaps) {
    const layer = layerOf.get(f) ?? 'unknown';
    const list = byLayer.get(layer) ?? [];
    list.push(f);
    byLayer.set(layer, list);
  }
  return [...byLayer.entries()].map(([layer, files]) => ({ layer, files }));
}

/** Module folder ids (full paths) for color-coding and collapse-to-module. */
export function getModulePaths(config: VisualizationConfig): Set<string> {
  const paths = new Set<string>();
  for (const m of config.modules ?? []) paths.add(m.path);
  return paths;
}

export function getLayerPaths(config: VisualizationConfig): Set<string> {
  const paths = new Set<string>();
  for (const stack of config.stacks) {
    for (const layer of stack.layers) {
      for (const p of layer.paths) paths.add(p);
    }
  }
  return paths;
}

export function getConfiguredPaths(config: VisualizationConfig): Set<string> {
  const paths = getLayerPaths(config);
  for (const m of getModulePaths(config)) paths.add(m);
  return paths;
}

export function getLayerPathOrder(
  config: VisualizationConfig,
): Map<string, number> {
  const order = new Map<string, number>();
  let idx = 0;
  for (const stack of config.stacks) {
    for (const layer of stack.layers) {
      for (const p of layer.paths) {
        if (!order.has(p)) order.set(p, idx++);
      }
    }
  }
  return order;
}
