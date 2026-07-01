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
    const resolveMember = makeMemberResolver(result.modules ?? []);
    result.features = config.features.map((f) => {
      if (f.modules.length === 0) {
        throw new Error(`Feature "${f.name}" has no members`);
      }
      const modules = f.modules.map((m) => resolveMember(f.name, m));
      const root = resolveMember(f.name, f.root);
      if (!modules.includes(root)) {
        throw new Error(
          `Feature "${f.name}": root "${f.root}" must be present in modules`,
        );
      }
      const entry: NonNullable<VisualizationConfig['features']>[number] = {
        name: f.name,
        root,
        modules,
      };
      if (f.config.description !== undefined) {
        entry.description = f.config.description;
      }
      return entry;
    });
  }

  return result;
}

/**
 * Builds a resolver that turns a feature member reference into its canonical
 * `layer::name` key. A reference is either qualified (`layer::name`, matched
 * exactly) or a bare name (resolved to the single declared module of that name).
 * A bare name that collides across layers is rejected — the author must qualify
 * it — so membership is never silently mis-attributed to the wrong layer.
 */
function makeMemberResolver(
  modules: NonNullable<VisualizationConfig['modules']>,
): (featureName: string, ref: string) => string {
  const keyOf = (m: { layer: string; name: string }): string =>
    `${m.layer}::${m.name}`;
  const keySet = new Set(modules.map(keyOf));
  const keysByName = new Map<string, string[]>();
  for (const m of modules) {
    const list = keysByName.get(m.name);
    if (list) list.push(keyOf(m));
    else keysByName.set(m.name, [keyOf(m)]);
  }

  return (featureName, ref) => {
    if (ref.includes('::')) {
      if (!keySet.has(ref)) {
        throw new Error(
          `Feature "${featureName}": member "${ref}" is not a declared module`,
        );
      }
      return ref;
    }
    const matches = keysByName.get(ref);
    if (!matches || matches.length === 0) {
      throw new Error(
        `Feature "${featureName}": member "${ref}" is not a declared module name`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Feature "${featureName}": member "${ref}" is ambiguous across layers (${matches.join(
          ', ',
        )}); qualify it as "layer::name"`,
      );
    }
    return matches[0]!;
  };
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
