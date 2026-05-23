import { existsSync } from 'node:fs';

import { createJiti } from 'jiti';

import type { Rule } from '../types.js';

const jiti = createJiti(import.meta.url, { interopDefault: true });

export async function loadConfig(configPath: string): Promise<Rule[]> {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const mod = (await jiti.import(configPath)) as {
    default?: unknown;
    rules?: unknown;
  };

  const rules = mod.default ?? mod.rules;

  if (!Array.isArray(rules)) {
    throw new Error(
      `Config at "${configPath}" must export a default or named "rules" array of Rule objects`,
    );
  }

  for (const rule of rules) {
    if (rule?.kind !== 'layer-stack') {
      throw new Error(
        `Config at "${configPath}" contains an invalid rule. Each rule must be created with layersTopDown()`,
      );
    }
  }

  return rules as Rule[];
}
