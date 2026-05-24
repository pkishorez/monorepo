import type { VisualizationConfig, VizSummary } from '../types';
import type {
  CoverageStatItem,
  FileStatus,
  ViolationItem,
} from './file-tree-types';

export function getPanelTitle(
  isFeatureView: boolean,
  selectedFeature: string | null,
): string {
  if (!isFeatureView) return 'File Coverage';
  return selectedFeature ? `Feature: ${selectedFeature}` : 'Feature Coverage';
}

export function getCoverageStats({
  isFeatureView,
  selectedFeature,
  selectedFeatureViolations,
  summary,
}: {
  isFeatureView: boolean;
  selectedFeature: string | null;
  selectedFeatureViolations: ViolationItem[];
  summary: VizSummary;
}): CoverageStatItem[] {
  if (isFeatureView) {
    const violationCount = selectedFeature
      ? selectedFeatureViolations.length
      : (summary.featureViolations?.length ?? 0);

    return [
      {
        key: 'violations',
        status: 'violation',
        count: violationCount,
        label: pluralize('violation', violationCount),
        hidden: violationCount === 0,
      },
      {
        key: 'uncovered',
        status: 'orphan',
        count: getFeatureUncoveredCount(summary),
        label: 'uncovered',
      },
      {
        key: 'covered',
        status: 'covered',
        count: selectedFeature
          ? getSelectedFeatureCoveredCount(summary, selectedFeature)
          : getFeatureCoveredCount(summary),
        label: 'covered',
      },
    ];
  }

  const layerViolationCount = summary.violations.length;
  const ignoredCount = summary.ignoredFiles.length;

  return [
    {
      key: 'violations',
      status: 'violation',
      count: layerViolationCount,
      label: pluralize('violation', layerViolationCount),
      hidden: layerViolationCount === 0,
    },
    {
      key: 'uncovered',
      status: 'orphan',
      count: summary.orphanFiles.length,
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

export function getHighlightedFiles({
  allFileIds,
  featureFiles,
  hoveredFeaturePath,
  isFeatureView,
  selectedLayer,
  summary,
}: {
  allFileIds: Set<string>;
  featureFiles: Set<string> | null;
  hoveredFeaturePath: string | null;
  isFeatureView: boolean;
  selectedLayer: string | null;
  summary: VizSummary;
}): Set<string> | null {
  if (isFeatureView) {
    if (hoveredFeaturePath) {
      const pathFiles = new Set<string>();
      for (const f of allFileIds) {
        if (f.startsWith(hoveredFeaturePath)) pathFiles.add(f);
      }
      return pathFiles.size > 0 ? pathFiles : null;
    }
    return featureFiles;
  }

  if (!selectedLayer) return null;
  const entry = summary.coveredFiles.find((c) => c.layer === selectedLayer);
  return entry ? new Set(entry.files) : null;
}

export function getFeatureFiles(
  summary: VizSummary,
  selectedFeature: string,
): Set<string> | null {
  const entry = summary.featureCoveredFiles?.find(
    (c) => c.feature === selectedFeature,
  );
  return entry ? new Set(entry.files) : null;
}

export function getConfiguredPaths(config: VisualizationConfig): Set<string> {
  const paths = new Set<string>();
  for (const stack of config.stacks) {
    for (const layer of stack.layers) {
      for (const p of layer.paths) {
        paths.add(p);
      }
    }
  }
  if (config.features) {
    for (const feat of config.features) {
      for (const p of feat.paths) {
        paths.add(p);
      }
    }
  }
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

export function getSortOrder({
  config,
  isFeatureView,
  selectedFeature,
  layerOrder,
}: {
  config: VisualizationConfig;
  isFeatureView: boolean;
  selectedFeature: string | null;
  layerOrder: Map<string, number>;
}): Map<string, number> {
  if (isFeatureView && selectedFeature && config.features) {
    const feat = config.features.find((f) => f.name === selectedFeature);
    if (feat) {
      const order = new Map<string, number>();
      for (let i = 0; i < feat.paths.length; i++) {
        order.set(feat.paths[i]!, i);
      }
      return order;
    }
  }
  return layerOrder;
}

export function getRelevantPaths({
  config,
  configuredPaths,
  isFeatureView,
  selectedFeature,
  selectedLayerPaths,
}: {
  config: VisualizationConfig;
  configuredPaths: Set<string>;
  isFeatureView: boolean;
  selectedFeature: string | null;
  selectedLayerPaths: string[] | null;
}): string[] {
  if (isFeatureView && selectedFeature && config.features) {
    const feat = config.features.find((f) => f.name === selectedFeature);
    return feat?.paths ?? [...configuredPaths];
  }
  return selectedLayerPaths ?? [...configuredPaths];
}

export function getFeatureStatusOverrides(
  summary: VizSummary,
  isFeatureView: boolean,
): Map<string, FileStatus> | null {
  if (!isFeatureView) return null;
  const overrides = new Map<string, FileStatus>();

  const featureCovered = new Set<string>();
  if (summary.featureCoveredFiles) {
    for (const { files } of summary.featureCoveredFiles) {
      for (const f of files) featureCovered.add(f);
    }
  }

  const featureViolationFiles = new Set<string>();
  if (summary.featureViolations) {
    for (const v of summary.featureViolations) {
      featureViolationFiles.add(v.fromFile);
      featureViolationFiles.add(v.toFile);
    }
  }

  const allFiles = new Set<string>();
  for (const { files } of summary.coveredFiles) {
    for (const f of files) allFiles.add(f);
  }
  for (const f of summary.orphanFiles) allFiles.add(f);

  const ignoredSet = new Set(summary.ignoredFiles);

  for (const f of allFiles) {
    if (ignoredSet.has(f)) {
      overrides.set(f, 'ignored');
    } else if (featureViolationFiles.has(f)) {
      overrides.set(f, 'violation');
    } else if (featureCovered.has(f)) {
      overrides.set(f, 'covered');
    } else {
      overrides.set(f, 'orphan');
    }
  }

  return overrides;
}

function getFeatureUncoveredCount(summary: VizSummary): number {
  if (!summary.featureCoveredFiles) return 0;
  const featureCovered = new Set<string>();
  for (const { files } of summary.featureCoveredFiles) {
    for (const f of files) featureCovered.add(f);
  }
  const allFiles = new Set<string>();
  for (const { files } of summary.coveredFiles) {
    for (const f of files) allFiles.add(f);
  }
  for (const f of summary.orphanFiles) allFiles.add(f);

  let count = 0;
  for (const f of allFiles) {
    if (!featureCovered.has(f) && !summary.ignoredFiles.includes(f)) count++;
  }
  return count;
}

function getFeatureCoveredCount(summary: VizSummary): number {
  if (!summary.featureCoveredFiles) return 0;
  const covered = new Set<string>();
  for (const { files } of summary.featureCoveredFiles) {
    for (const f of files) covered.add(f);
  }
  return covered.size;
}

function getSelectedFeatureCoveredCount(
  summary: VizSummary,
  selectedFeature: string,
): number {
  const entry = summary.featureCoveredFiles?.find(
    (c) => c.feature === selectedFeature,
  );
  return entry?.files.length ?? 0;
}

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}
