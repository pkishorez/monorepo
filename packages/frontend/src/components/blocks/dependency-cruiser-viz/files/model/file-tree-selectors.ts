import type { VisualizationConfig, VizSummary } from '../../model';
import type { CoverageStatItem, ViolationItem } from './file-tree-types';

export function getCoverageStats({
  summary,
  selectedLayer,
  coverageMode,
}: {
  summary: VizSummary;
  selectedLayer: string | null;
  coverageMode: 'layers' | 'modules';
}): CoverageStatItem[] {
  const ignoredCount = summary.ignoredFiles.length;

  // Modules tab: report MODULE coverage — files claimed by a declared module
  // vs files inside a layer but in no module (the coverage gaps).
  if (coverageMode === 'modules') {
    const moduleCovered = new Set<string>();
    for (const m of summary.moduleCoverage) {
      for (const f of m.files) moduleCovered.add(f);
    }
    return [
      {
        key: 'present',
        status: 'covered',
        count: moduleCovered.size,
        label: 'present',
      },
      {
        key: 'not-covered',
        status: 'orphan',
        count: summary.coverageGaps.length,
        label: 'not covered',
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

  const layerViolationCount = selectedLayer
    ? summary.violations.filter(
        (v) => v.from === selectedLayer || v.to === selectedLayer,
      ).length
    : summary.violations.length;

  return [
    {
      key: 'violations',
      status: 'violation',
      count: layerViolationCount,
      label: layerViolationCount === 1 ? 'violation' : 'violations',
      hidden: layerViolationCount === 0,
    },
    {
      key: 'present',
      status: 'covered',
      count: summary.coveredFiles.reduce((sum, l) => sum + l.files.length, 0),
      label: 'present',
    },
    {
      key: 'not-covered',
      status: 'orphan',
      count: summary.layerOrphanFiles.length,
      label: 'not covered',
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
}: {
  summary: VizSummary;
}): ViolationItem[] {
  // The full list is always returned (no layer filtering) so the panel never
  // resizes on hover/selection; the active layer dims unrelated rows instead.
  return summary.violations;
}

/**
 * Resolve the file sets the tree should emphasize. Layer and module are
 * mutually exclusive axes (the active tab supplies at most one), so they're
 * never combined here.
 *
 * - The selected module's files become `owned` (primary emphasis) and the
 *   highlighted module's files `secondary`; `all` is their union (used for
 *   folder containment / dimming). Both can be active at once.
 * - With only a layer selected, that layer's files become `owned`.
 * - With nothing selected, every field is null (no emphasis).
 */
export function getHighlightedFiles({
  summary,
  selectedLayer,
  selectedModuleFiles,
  highlightedModuleFiles,
}: {
  summary: VizSummary;
  selectedLayer: string | null;
  selectedModuleFiles: Set<string> | null;
  highlightedModuleFiles: Set<string> | null;
}): {
  all: Set<string> | null;
  owned: Set<string> | null;
  secondary: Set<string> | null;
} {
  if (selectedModuleFiles || highlightedModuleFiles) {
    const all = new Set([
      ...(selectedModuleFiles ?? []),
      ...(highlightedModuleFiles ?? []),
    ]);
    return {
      all,
      owned: selectedModuleFiles,
      secondary: highlightedModuleFiles,
    };
  }
  if (!selectedLayer) return { all: null, owned: null, secondary: null };
  const entry = summary.coveredFiles.find((c) => c.layer === selectedLayer);
  if (!entry) return { all: null, owned: null, secondary: null };
  const owned = new Set(entry.files);
  return { all: owned, owned, secondary: null };
}

/**
 * Files in a declared layer but in no declared module (coverage gaps),
 * straight from the summary.
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
