import { dirname, resolve } from 'node:path';

import { Effect } from 'effect';

import { lintLayers as evaluateLayers } from '../domain/layers/index.js';
import { ConfigService, type Config } from '../services/config/index.js';
import { Cruiser } from '../services/file-cruiser/index.js';

export function lintLayers(configPath: string) {
  return Effect.gen(function* () {
    const absoluteConfigPath = resolve(configPath);
    const baseDir = dirname(absoluteConfigPath);
    const configService = yield* ConfigService;
    const config = yield* configService.read(absoluteConfigPath);
    const cruiser = yield* Cruiser;
    const fileGraph = yield* cruiser.cruise(
      baseDir,
      config.sourceRoots,
      config.ignoredPaths,
    );
    return evaluateLayers(fileGraph, config.layers, combineRules(config));
  });
}

function combineRules(
  config: Config,
): Readonly<Record<string, readonly string[]>> {
  const rules = new Map<string, Set<string>>();
  for (const { rules: graphRules } of Object.values(config.layerGraphs)) {
    for (const [from, destinations] of Object.entries(graphRules)) {
      const combined = rules.get(from) ?? new Set<string>();
      rules.set(from, combined);
      for (const to of destinations) combined.add(to);
    }
  }
  return Object.fromEntries(
    [...rules.entries()].map(([from, destinations]) => [
      from,
      [...destinations],
    ]),
  );
}
