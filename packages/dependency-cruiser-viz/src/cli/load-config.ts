import { existsSync } from 'node:fs';

import { createJiti } from 'jiti';

import type { ProjectConfig } from '../types.js';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});

export async function loadConfig(configPath: string): Promise<ProjectConfig> {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const mod = (await jiti.import(configPath)) as {
    default?: unknown;
  };

  const exported = mod.default;

  if (
    !exported ||
    typeof exported !== 'object' ||
    !('rootDir' in exported) ||
    !('rules' in exported)
  ) {
    throw new Error(
      `Config at "${configPath}" must export a ProjectConfig: { rootDir: string; rules: Rule[] }`,
    );
  }

  const config = exported as ProjectConfig;

  for (const rule of config.rules) {
    if (rule?.kind !== 'layer-stack') {
      throw new Error(
        `Config at "${configPath}" contains an invalid rule. Each rule must be created with layersTopDown()`,
      );
    }
  }

  if (config.features) {
    for (const feat of config.features) {
      if (feat?.kind !== 'feature') {
        throw new Error(
          `Config at "${configPath}" contains an invalid feature. Each feature must be created with feature()`,
        );
      }
    }
  }

  return config;
}
