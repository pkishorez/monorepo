import type { ProjectConfig, VisualizationConfig } from '../types.js';
import { validateLayerOrdering } from './validate-layer-ordering.js';

export function toVisualizationConfig(
  config: ProjectConfig,
): VisualizationConfig {
  const { rules, rootDir } = config;
  validateLayerOrdering(rules);

  const stacks: VisualizationConfig['stacks'] = [];

  for (const rule of rules) {
    const { layers } = rule;
    const allowedImports: Array<{ from: string; to: string }> = [];

    for (let i = 0; i < layers.length; i++) {
      const upper = layers[i]!;
      for (let j = i + 1; j < layers.length; j++) {
        const lower = layers[j]!;
        allowedImports.push({ from: upper.name, to: lower.name });
      }
    }

    const stack: VisualizationConfig['stacks'][number] = {
      name: rule.name,
      layers: layers.map((l) => {
        const entry: VisualizationConfig['stacks'][number]['layers'][number] = {
          name: l.name,
          paths: [...l.paths],
        };
        if (l.config.description !== undefined) {
          entry.description = l.config.description;
        }
        return entry;
      }),
      allowedImports,
    };
    if (rule.config.description !== undefined) {
      stack.description = rule.config.description;
    }
    if (rule.config.group !== undefined) {
      stack.group = rule.config.group;
    }
    stacks.push(stack);
  }

  const result: VisualizationConfig = { rootDir, stacks };
  if (config.ignore && config.ignore.length > 0) {
    result.ignore = config.ignore;
  }

  const featureNames = new Set((config.features ?? []).map((f) => f.name));

  if (config.features && config.features.length > 0) {
    result.features = config.features.map((f) => {
      const entry: NonNullable<VisualizationConfig['features']>[number] = {
        name: f.name,
      };
      if (f.config.description !== undefined) {
        entry.description = f.config.description;
      }
      return entry;
    });
  }

  if (config.modules && config.modules.length > 0) {
    result.modules = resolveModules(config, featureNames);
  }

  return result;
}

type LayerLookup = { name: string; group?: string; paths: string[] };

function resolveModules(
  config: ProjectConfig,
  featureNames: Set<string>,
): NonNullable<VisualizationConfig['modules']> {
  const layers: LayerLookup[] = [];
  for (const rule of config.rules) {
    for (const l of rule.layers) {
      const lookup: LayerLookup = { name: l.name, paths: [...l.paths] };
      if (rule.config.group !== undefined) {
        lookup.group = rule.config.group;
      }
      layers.push(lookup);
    }
  }

  const seenPaths = new Set<string>();
  const resolved: NonNullable<VisualizationConfig['modules']> = [];

  for (const mod of config.modules ?? []) {
    if (seenPaths.has(mod.path)) {
      throw new Error(`Duplicate module path "${mod.path}"`);
    }
    seenPaths.add(mod.path);

    const owning = layers.filter((l) =>
      l.paths.some((p) => mod.path === p || mod.path.startsWith(p + '/')),
    );
    if (owning.length === 0) {
      throw new Error(`Module "${mod.path}" does not sit under any layer path`);
    }

    const owningLayer = owning[0]!;
    const layerPath = owningLayer.paths.find(
      (p) => mod.path === p || mod.path.startsWith(p + '/'),
    )!;

    if (mod.feature !== undefined && !featureNames.has(mod.feature)) {
      throw new Error(
        `Module "${mod.path}" references unknown feature "${mod.feature}"`,
      );
    }
    for (const name of mod.sharedWith ?? []) {
      if (!featureNames.has(name)) {
        throw new Error(
          `Module "${mod.path}" sharedWith references unknown feature "${name}"`,
        );
      }
    }

    const entry: NonNullable<VisualizationConfig['modules']>[number] = {
      path: mod.path,
      name: deriveModuleName(mod.path, layerPath),
      layer: owningLayer.name,
      visibility: mod.visibility,
    };
    if (owningLayer.group !== undefined) {
      entry.group = owningLayer.group;
    }
    if (mod.feature !== undefined) {
      entry.feature = mod.feature;
    }
    if (mod.sharedWith !== undefined) {
      entry.sharedWith = [...mod.sharedWith];
    }
    resolved.push(entry);
  }

  return resolved;
}

function deriveModuleName(modulePath: string, layerPath: string): string {
  if (modulePath === layerPath) return '';
  return modulePath.slice(layerPath.length + 1);
}
