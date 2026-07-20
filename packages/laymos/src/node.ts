import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Effect } from 'effect';
import { createJiti } from 'jiti';

import { defineConfig } from './config/define-config.js';
import type { LaymosConfig } from './config/types.js';
import { extractFileGraph } from './engine/1-extract/index.js';
import { resolveProject } from './engine/2-resolve/index.js';
import { evaluateRules } from './engine/3-evaluate/index.js';
import { emitReport } from './engine/4-emit/index.js';
import { ConfigLoadError } from './engine/errors.js';
import type { LaymosError } from './engine/errors.js';
import type { AnalysisWarning, LaymosReport } from './report/index.js';

export { ConfigLoadError, ExtractError } from './engine/errors.js';

/** load config → extract → resolve → evaluate → emit; violations are data, config errors fail. */
export function analyzeProject(
  baseDir: string,
): Effect.Effect<LaymosReport, LaymosError> {
  return Effect.gen(function* () {
    const config = yield* loadConfig(baseDir);
    const warnings = findMissingPathWarnings(baseDir, config);
    const fileGraph = yield* extractFileGraph(baseDir, config.ignore ?? []);
    const resolved = yield* resolveProject(config, fileGraph);
    const evaluation = yield* evaluateRules(resolved);
    return yield* emitReport(resolved, evaluation, warnings);
  });
}

export function analyzeProjectPromise(baseDir: string): Promise<LaymosReport> {
  return Effect.runPromise(analyzeProject(baseDir));
}

function loadConfig(
  baseDir: string,
): Effect.Effect<LaymosConfig, ConfigLoadError> {
  const path = resolve(baseDir, 'laymos.config.ts');
  return Effect.tryPromise({
    try: async () => {
      if (!existsSync(path)) {
        throw new Error(`Config file not found: ${path}`);
      }
      const jiti = createJiti(import.meta.url, {
        interopDefault: true,
        moduleCache: false,
      });
      const imported = (await jiti.import(path)) as { default?: unknown };
      const config = imported.default;
      if (!isLaymosConfig(config)) {
        throw new Error(
          `Config at "${path}" must default-export a value created with defineConfig()`,
        );
      }
      return defineConfig(config);
    },
    catch: (cause) => new ConfigLoadError({ path, cause }),
  });
}

function isLaymosConfig(value: unknown): value is LaymosConfig {
  if (typeof value !== 'object' || value === null || !('graphs' in value)) {
    return false;
  }
  const config = value as Partial<LaymosConfig>;
  return (
    Array.isArray(config.graphs) &&
    config.graphs.every((graph) => graph?.kind === 'layer-graph') &&
    (config.modules === undefined || Array.isArray(config.modules)) &&
    (config.moduleRules === undefined || Array.isArray(config.moduleRules)) &&
    (config.ignore === undefined || Array.isArray(config.ignore))
  );
}

function findMissingPathWarnings(
  baseDir: string,
  config: LaymosConfig,
): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];
  const layers = new Set(config.graphs.flatMap((graph) => [...graph.layers]));
  for (const layer of layers) {
    for (const path of layer.paths) {
      if (!existsSync(resolve(baseDir, path))) {
        warnings.push({
          kind: 'missing-layer-path',
          layer: layer.name,
          path,
        });
      }
    }
  }
  for (const module of config.modules ?? []) {
    if (!existsSync(resolve(baseDir, module.path))) {
      warnings.push({
        kind: 'missing-module-path',
        module: module.path,
        path: module.path,
      });
    }
  }
  return warnings;
}
