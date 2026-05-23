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

  return { violations, orphanFiles, ignoredFiles, coveredFiles };
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

function pathToRegExp(p: string): RegExp {
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}(/|$)`);
}
