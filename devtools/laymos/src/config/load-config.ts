import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Effect } from 'effect';
import { createJiti } from 'jiti';

import { ConfigLoadError } from '../engine/errors.js';
import { defineConfig } from './define-config.js';
import type { LaymosConfig } from './types.js';

/** Loads and validates the Laymos config at the project root. */
export function loadConfig(
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
    Array.isArray(config.sourceRoots) &&
    (config.modules === undefined || Array.isArray(config.modules)) &&
    (config.moduleRules === undefined || Array.isArray(config.moduleRules)) &&
    (config.ignore === undefined || Array.isArray(config.ignore))
  );
}
