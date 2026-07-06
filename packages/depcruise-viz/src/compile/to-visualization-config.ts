import type {
  ModuleDecl,
  ProjectConfig,
  Rule,
  VisualizationConfig,
} from '../types.js';
import { reachableLayers } from './reachability.js';
import { validateLayerOrdering } from './validate-layer-ordering.js';

export function toVisualizationConfig(
  config: ProjectConfig,
): VisualizationConfig {
  const { rootDir } = config;
  const rules = config.rules ?? [];
  validateLayerOrdering(rules);

  const stacks: VisualizationConfig['stacks'] = [];

  for (const rule of rules) {
    const { layers } = rule;
    const closure = reachableLayers(rule);
    const allowedImports: Array<{ from: string; to: string }> = [];

    for (const from of layers) {
      for (const to of layers) {
        if (closure.get(from.name)!.has(to.name)) {
          allowedImports.push({ from: from.name, to: to.name });
        }
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
      edges: reduceEdges(rule, closure),
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

  return result;
}

/**
 * Transitive reduction of the authored edges: an edge u→v is dropped when v
 * is also reachable from u through some intermediate layer, so the
 * visualization draws only the minimal DAG.
 */
function reduceEdges(
  rule: Rule,
  closure: Map<string, Set<string>>,
): Array<{ from: string; to: string }> {
  return rule.edges
    .filter(
      (e) =>
        ![...closure.get(e.from.name)!].some(
          (mid) => mid !== e.to.name && closure.get(mid)!.has(e.to.name),
        ),
    )
    .map((e) => ({ from: e.from.name, to: e.to.name }));
}

type LayerLookup = { name: string; paths: string[] };

function resolveModules(
  config: ProjectConfig,
): NonNullable<VisualizationConfig['modules']> {
  const layers: LayerLookup[] = [];
  for (const rule of config.rules ?? []) {
    for (const l of rule.layers) {
      layers.push({ name: l.name, paths: [...l.paths] });
    }
  }

  const seenPaths = new Set<string>();
  const resolved: NonNullable<VisualizationConfig['modules']> = [];
  const declaredPaths = new Set((config.modules ?? []).map((m) => m.path));

  for (const mod of config.modules ?? []) {
    if (seenPaths.has(mod.path)) {
      throw new Error(`Duplicate module path "${mod.path}"`);
    }
    seenPaths.add(mod.path);
    validateRuleRefs(mod, declaredPaths);

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
      name: mod.name ?? deriveModuleName(mod.path, layerPath),
      layer: owningLayer.name,
      opaque: mod.opaque,
      ...(mod.rules === undefined ? {} : { rules: mod.rules }),
    });
  }

  return resolved;
}

/** Every path in `onlyImports` / `onlyImportedBy` must name a declared
 * module, so a typo fails the compile instead of silently tightening the
 * rule. */
function validateRuleRefs(mod: ModuleDecl, declaredPaths: Set<string>): void {
  const refs = [
    ...(mod.rules?.onlyImports ?? []),
    ...(mod.rules?.onlyImportedBy ?? []),
  ];
  for (const ref of refs) {
    if (!declaredPaths.has(ref)) {
      throw new Error(
        `Module "${mod.path}": rule references "${ref}", which is not a declared module path`,
      );
    }
  }
}

/**
 * A module's display name relative to its layer. Normally the path tail below
 * the layer (`src/domain/cart` under `src/domain` → `cart`). When a module is
 * declared at exactly its layer's path (e.g. the `services` layer lists
 * `src/services/order-items` as one of its paths and a module is declared
 * there), the tail would be empty; fall back to the path's basename so every
 * module surfaces under its own name instead of collapsing into a single
 * anonymous "(layer root)" node shared by all such modules. File modules keep
 * their extension (`src/types.ts` → `types.ts`) so a file module reads as a
 * file, not a folder.
 */
function deriveModuleName(modulePath: string, layerPath: string): string {
  if (modulePath === layerPath) {
    const slash = layerPath.lastIndexOf('/');
    return slash === -1 ? layerPath : layerPath.slice(slash + 1);
  }
  return modulePath.slice(layerPath.length + 1);
}
