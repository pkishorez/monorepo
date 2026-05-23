import type { ICruiseResult } from 'dependency-cruiser';

import type { VisualizationConfig, VizSummary } from './types.js';

export function summarizeCruiseResult(
  cruiseResult: ICruiseResult,
  visualization: VisualizationConfig,
): VizSummary {
  const layerPatterns: Array<{ layer: string; patterns: RegExp[] }> = [];
  for (const stack of visualization.stacks) {
    for (const layer of stack.layers) {
      const existing = layerPatterns.find((l) => l.layer === layer.name);
      if (existing) {
        for (const p of layer.paths) {
          existing.patterns.push(pathToRegExp(p));
        }
      } else {
        layerPatterns.push({
          layer: layer.name,
          patterns: layer.paths.map(pathToRegExp),
        });
      }
    }
  }

  const violations: VizSummary['violations'] = [];
  for (const v of cruiseResult.summary.violations) {
    if (isFeatureRule(v.rule.name)) continue;

    const fromLayer = findLayer(v.from, layerPatterns);
    const toLayer = findLayer(v.to, layerPatterns);
    if (fromLayer && toLayer) {
      violations.push({
        from: fromLayer,
        to: toLayer,
        fromFile: v.from,
        toFile: v.to,
        rule: v.rule.name,
        severity: v.rule.severity,
      });
    }
  }

  const coveredFiles: VizSummary['coveredFiles'] = layerPatterns.map(
    ({ layer }) => ({
      layer,
      files: [] as string[],
    }),
  );

  const ignorePatterns = (visualization.ignore ?? []).map(pathToRegExp);

  const orphanFiles: string[] = [];
  const ignoredFiles: string[] = [];
  const rootDir = visualization.rootDir;
  const modules = (cruiseResult.modules ?? []).filter(
    (mod) => mod.source.startsWith(rootDir + '/') || mod.source === rootDir,
  );

  for (const mod of modules) {
    const source = mod.source;

    if (ignorePatterns.some((re) => re.test(source))) {
      ignoredFiles.push(source);
      continue;
    }

    let matched = false;

    for (let i = 0; i < layerPatterns.length; i++) {
      const { patterns } = layerPatterns[i]!;
      if (patterns.some((re) => re.test(source))) {
        coveredFiles[i]!.files.push(source);
        matched = true;
        break;
      }
    }

    if (!matched) {
      orphanFiles.push(source);
    }
  }

  const result: VizSummary = {
    violations,
    orphanFiles,
    ignoredFiles,
    coveredFiles,
  };

  if (visualization.features && visualization.features.length > 0) {
    const featurePatterns: Array<{
      feature: string;
      patterns: RegExp[];
    }> = visualization.features.map((f) => ({
      feature: f.name,
      patterns: f.paths.map(pathToRegExp),
    }));

    const featureViolations: NonNullable<VizSummary['featureViolations']> = [];
    for (const v of cruiseResult.summary.violations) {
      if (!isFeatureRule(v.rule.name)) continue;

      const fromFeature = findFeature(v.from, featurePatterns);
      const toFeature = findFeature(v.to, featurePatterns);
      if (fromFeature && toFeature && fromFeature !== toFeature) {
        featureViolations.push({
          from: fromFeature,
          to: toFeature,
          fromFile: v.from,
          toFile: v.to,
          rule: v.rule.name,
          severity: v.rule.severity,
        });
      }
    }

    const featureCoveredFiles: NonNullable<VizSummary['featureCoveredFiles']> =
      featurePatterns.map(({ feature }) => ({
        feature,
        files: [] as string[],
      }));

    for (const mod of modules) {
      const source = mod.source;
      if (ignorePatterns.some((re) => re.test(source))) continue;

      for (let i = 0; i < featurePatterns.length; i++) {
        const { patterns } = featurePatterns[i]!;
        if (patterns.some((re) => re.test(source))) {
          featureCoveredFiles[i]!.files.push(source);
        }
      }
    }

    result.featureViolations = featureViolations;
    result.featureCoveredFiles = featureCoveredFiles;
  }

  return result;
}

function findLayer(
  filePath: string,
  layerPatterns: Array<{ layer: string; patterns: RegExp[] }>,
): string | undefined {
  for (const { layer, patterns } of layerPatterns) {
    if (patterns.some((re) => re.test(filePath))) {
      return layer;
    }
  }
  return undefined;
}

function findFeature(
  filePath: string,
  featurePatterns: Array<{ feature: string; patterns: RegExp[] }>,
): string | undefined {
  for (const { feature, patterns } of featurePatterns) {
    if (patterns.some((re) => re.test(filePath))) {
      return feature;
    }
  }
  return undefined;
}

function isFeatureRule(ruleName: string): boolean {
  return ruleName.startsWith('feature ');
}

function pathToRegExp(p: string): RegExp {
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}(/|$)`);
}
