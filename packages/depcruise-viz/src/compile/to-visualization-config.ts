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
    stacks.push(stack);
  }

  const result: VisualizationConfig = { rootDir, stacks };
  if (config.ignore && config.ignore.length > 0) {
    result.ignore = config.ignore;
  }

  if (config.modules && config.modules.length > 0) {
    result.modules = resolveModules(config);
  }

  if (config.features && config.features.length > 0) {
    const declaredModuleNames = new Set(
      (result.modules ?? []).map((m) => m.name),
    );
    result.features = config.features.map((f) => {
      if (f.modules.length === 0) {
        throw new Error(`Feature "${f.name}" has no members`);
      }
      for (const memberName of f.modules) {
        if (!declaredModuleNames.has(memberName)) {
          throw new Error(
            `Feature "${f.name}": member "${memberName}" is not a declared module name`,
          );
        }
      }
      if (!declaredModuleNames.has(f.root)) {
        throw new Error(
          `Feature "${f.name}": root "${f.root}" is not a declared module name`,
        );
      }
      const entry: NonNullable<VisualizationConfig['features']>[number] = {
        name: f.name,
        root: f.root,
        modules: [...f.modules],
      };
      if (f.config.description !== undefined) {
        entry.description = f.config.description;
      }
      return entry;
    });
  }

  return result;
}

type LayerLookup = { name: string; paths: string[] };

function resolveModules(
  config: ProjectConfig,
): NonNullable<VisualizationConfig['modules']> {
  const layers: LayerLookup[] = [];
  for (const rule of config.rules) {
    for (const l of rule.layers) {
      layers.push({ name: l.name, paths: [...l.paths] });
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

    resolved.push({
      path: mod.path,
      name: deriveModuleName(mod.path, layerPath),
      layer: owningLayer.name,
      barrel: mod.barrel,
    });
  }

  return resolved;
}

/**
 * A module's display name relative to its layer. Normally the path tail below
 * the layer (`src/domain/cart` under `src/domain` → `cart`). When a module is
 * declared at exactly its layer's path (e.g. the `services` layer lists
 * `src/services/order-items` as one of its paths and a module is declared
 * there), the tail would be empty; fall back to the path's basename so every
 * module surfaces under its own name instead of collapsing into a single
 * anonymous "(layer root)" node shared by all such modules.
 */
function deriveModuleName(modulePath: string, layerPath: string): string {
  if (modulePath === layerPath) {
    const slash = layerPath.lastIndexOf('/');
    return slash === -1 ? layerPath : layerPath.slice(slash + 1);
  }
  return modulePath.slice(layerPath.length + 1);
}
