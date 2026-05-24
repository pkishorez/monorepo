import type { VisualizationConfig, VizSummary } from '../types';
import type {
  CoverageStatItem,
  FeatureViolationCount,
  ViolationItem,
} from './file-tree-types';

export function getCoverageStats({
  summary,
  selectedLayer,
  selectedFeature,
  isFeatureOverview,
}: {
  summary: VizSummary;
  selectedLayer: string | null;
  selectedFeature: string | null;
  isFeatureOverview?: boolean;
}): CoverageStatItem[] {
  if (selectedFeature) {
    const featureViolations =
      summary.featureViolations?.filter(
        (v) => v.from === selectedFeature || v.to === selectedFeature,
      ) ?? [];
    const coveredCount =
      summary.featureCoveredFiles?.find((c) => c.feature === selectedFeature)
        ?.files.length ?? 0;

    return [
      {
        key: 'violations',
        status: 'violation',
        count: featureViolations.length,
        label: featureViolations.length === 1 ? 'violation' : 'violations',
        hidden: featureViolations.length === 0,
      },
      {
        key: 'covered',
        status: 'covered',
        count: coveredCount,
        label: 'files',
      },
    ];
  }

  if (isFeatureOverview) {
    const allFeatureCovered = getAllFeatureCoveredFiles(summary);
    const totalFiles = new Set<string>();
    for (const { files } of summary.coveredFiles) {
      for (const f of files) totalFiles.add(f);
    }
    for (const f of summary.orphanFiles) totalFiles.add(f);

    const uncoveredCount = [...totalFiles].filter(
      (f) => !allFeatureCovered.has(f) && !summary.ignoredFiles.includes(f),
    ).length;
    const violationCount = summary.featureViolations?.length ?? 0;

    return [
      {
        key: 'violations',
        status: 'violation',
        count: violationCount,
        label: violationCount === 1 ? 'violation' : 'violations',
        hidden: violationCount === 0,
      },
      {
        key: 'uncovered',
        status: 'orphan',
        count: uncoveredCount,
        label: 'not in features',
      },
      {
        key: 'covered',
        status: 'covered',
        count: allFeatureCovered.size,
        label: 'in features',
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

export function getViolations({
  summary,
  selectedLayer,
  selectedFeature,
  isFeatureOverview,
}: {
  summary: VizSummary;
  selectedLayer: string | null;
  selectedFeature: string | null;
  isFeatureOverview?: boolean;
}): ViolationItem[] {
  if (selectedFeature) {
    return (summary.featureViolations ?? []).filter(
      (v) => v.from === selectedFeature || v.to === selectedFeature,
    );
  }
  if (isFeatureOverview) {
    return summary.featureViolations ?? [];
  }
  if (selectedLayer) {
    return summary.violations.filter(
      (v) => v.from === selectedLayer || v.to === selectedLayer,
    );
  }
  return summary.violations;
}

export function getHighlightedFiles({
  summary,
  selectedLayer,
  featureFiles,
}: {
  summary: VizSummary;
  selectedLayer: string | null;
  featureFiles: Set<string> | null;
}): Set<string> | null {
  if (featureFiles && selectedLayer) {
    const layerEntry = summary.coveredFiles.find(
      (c) => c.layer === selectedLayer,
    );
    if (!layerEntry) return featureFiles;
    const intersection = new Set<string>();
    for (const f of featureFiles) {
      if (layerEntry.files.includes(f)) intersection.add(f);
    }
    return intersection.size > 0 ? intersection : null;
  }
  if (featureFiles) return featureFiles;
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

export function getFeatureViolationCounts(
  summary: VizSummary,
  features: VisualizationConfig['features'],
): FeatureViolationCount[] {
  if (!features || !summary.featureViolations) return [];
  return features.map((f) => ({
    featureName: f.name,
    count: summary.featureViolations!.filter(
      (v) => v.from === f.name || v.to === f.name,
    ).length,
  }));
}

export function getAllFeatureCoveredFiles(summary: VizSummary): Set<string> {
  const covered = new Set<string>();
  if (summary.featureCoveredFiles) {
    for (const { files } of summary.featureCoveredFiles) {
      for (const f of files) covered.add(f);
    }
  }
  return covered;
}

export function getUncoveredFiles(
  summary: VizSummary,
  coveredByFeatures: Set<string>,
): Set<string> {
  const uncovered = new Set<string>();
  for (const { files } of summary.coveredFiles) {
    for (const f of files) {
      if (!coveredByFeatures.has(f) && !summary.ignoredFiles.includes(f)) {
        uncovered.add(f);
      }
    }
  }
  for (const f of summary.orphanFiles) {
    if (!coveredByFeatures.has(f) && !summary.ignoredFiles.includes(f)) {
      uncovered.add(f);
    }
  }
  return uncovered;
}

export function getConfiguredPaths(config: VisualizationConfig): Set<string> {
  const paths = new Set<string>();
  for (const stack of config.stacks) {
    for (const layer of stack.layers) {
      for (const p of layer.paths) paths.add(p);
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
  selectedFeature,
  layerOrder,
}: {
  config: VisualizationConfig;
  selectedFeature: string | null;
  layerOrder: Map<string, number>;
}): Map<string, number> {
  if (selectedFeature && config.features) {
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
