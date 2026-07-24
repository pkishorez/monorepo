import { Option, Schema } from 'effect';

import type { Layer, LaymosConfig, ModuleDef, ModuleRules } from './types.js';
import { normalizeConfigPath, pathContains } from './path.js';

const ErrorMessageSchema = Schema.Struct({ message: Schema.String });

export function defineConfig(config: LaymosConfig): LaymosConfig {
  return config;
}

export interface ConfigValidation {
  readonly config: LaymosConfig;
  readonly issues: readonly string[];
}

export function validateConfig(config: LaymosConfig): ConfigValidation {
  const normalizationIssues: string[] = [];
  const normalizePath = (subject: string, path: string): string => {
    try {
      return normalizeConfigPath(path);
    } catch (cause) {
      const error = Schema.decodeUnknownOption(ErrorMessageSchema)(cause);
      normalizationIssues.push(
        `${subject}: ${Option.isSome(error) ? error.value.message : String(cause)}`,
      );
      return path;
    }
  };
  const layers = new Map<Layer, Layer>();
  const normalizeLayer = (layer: Layer): Layer => {
    const existing = layers.get(layer);
    if (existing !== undefined) return existing;
    const normalized = {
      ...layer,
      paths: layer.paths.map((path) =>
        normalizePath(`Layer "${layer.name}" path`, path),
      ),
    };
    layers.set(layer, normalized);
    return normalized;
  };
  const modules = new Map<ModuleDef, ModuleDef>();
  const normalizeModule = (module: ModuleDef): ModuleDef => {
    const existing = modules.get(module);
    if (existing !== undefined) return existing;
    const normalized = {
      ...module,
      path: normalizePath('Module path', module.path),
    };
    modules.set(module, normalized);
    return normalized;
  };
  const normalizedModules = config.modules?.map(normalizeModule);
  const normalizedRules = config.moduleRules?.map(
    (rule): ModuleRules => ({
      ...rule,
      module: normalizeModule(rule.module),
      ...(rule.canImport === undefined
        ? {}
        : { canImport: rule.canImport.map(normalizeModule) }),
      ...(rule.canImportedBy === undefined
        ? {}
        : { canImportedBy: rule.canImportedBy.map(normalizeModule) }),
    }),
  );
  const normalizedConfig: LaymosConfig = {
    ...config,
    sourceRoots: config.sourceRoots.map((path) =>
      normalizePath('Source root', path),
    ),
    graphs: config.graphs.map((graph) => ({
      ...graph,
      layers: graph.layers.map(normalizeLayer),
      edges: graph.edges.map((edge) => ({
        from: normalizeLayer(edge.from),
        to: normalizeLayer(edge.to),
      })),
    })),
    ...(normalizedModules === undefined ? {} : { modules: normalizedModules }),
    ...(normalizedRules === undefined ? {} : { moduleRules: normalizedRules }),
    ...(config.ignore === undefined
      ? {}
      : {
          ignore: config.ignore.map((path) =>
            normalizePath('Ignored path', path),
          ),
        }),
  };
  const issues = [
    ...normalizationIssues,
    ...builderIssues(normalizedConfig),
    ...sourceRootIssues(normalizedConfig),
    ...duplicateGraphNames(normalizedConfig),
    ...duplicateLayerNames(normalizedConfig),
    ...duplicateLayerPaths(normalizedConfig),
    ...duplicateIgnoredPaths(normalizedConfig),
    ...unionCycles(normalizedConfig),
    ...architectureIntentIssues(normalizedConfig),
    ...moduleIssues(normalizedConfig),
    ...projectNarrativeIssues(normalizedConfig),
  ];
  return { config: normalizedConfig, issues };
}

function builderIssues(config: LaymosConfig): string[] {
  const issues: string[] = [];
  for (const graph of config.graphs) {
    if (graph.name.trim().length === 0) {
      issues.push('Layer Graph name must not be empty');
    }
    const edges = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.from === edge.to || edge.from.name === edge.to.name) {
        issues.push(
          `Layer Graph "${graph.name}" contains self-edge "${edge.from.name} -> ${edge.to.name}"`,
        );
      }
      const key = `${edge.from.name}\0${edge.to.name}`;
      if (edges.has(key)) {
        issues.push(
          `Layer Graph "${graph.name}" contains duplicate edge "${edge.from.name} -> ${edge.to.name}"`,
        );
      }
      edges.add(key);
    }
    for (const layer of graph.layers) {
      if (layer.name.trim().length === 0) {
        issues.push('Layer name must not be empty');
      }
      if (layer.paths.length === 0) {
        issues.push(`Layer "${layer.name}" must have at least 1 path`);
      }
      if (new Set(layer.paths).size !== layer.paths.length) {
        issues.push(`Layer "${layer.name}" contains duplicate paths`);
      }
    }
  }
  for (const module of config.modules ?? []) {
    if (module.path.trim().length === 0) {
      issues.push('Module path must not be empty');
    }
  }
  for (const rule of config.moduleRules ?? []) {
    if (rule.canImport === undefined && rule.canImportedBy === undefined) {
      issues.push(
        `Rules for module "${rule.module.path}" must declare canImport or canImportedBy`,
      );
    }
  }
  return issues;
}

function architectureIntentIssues(config: LaymosConfig): string[] {
  const issues: string[] = [];
  for (const graph of config.graphs) {
    if (
      typeof graph.description !== 'string' ||
      graph.description.trim().length === 0
    ) {
      issues.push(`Layer Graph "${graph.name}" description must not be empty`);
    }
  }
  const layers = new Set(config.graphs.flatMap((graph) => graph.layers));
  for (const layer of layers) {
    if (
      typeof layer.description !== 'string' ||
      layer.description.trim().length === 0
    ) {
      issues.push(`Layer "${layer.name}" description must not be empty`);
    }
  }
  for (const moduleDef of config.modules ?? []) {
    if (
      typeof moduleDef.description !== 'string' ||
      moduleDef.description.trim().length === 0
    ) {
      issues.push(`Module "${moduleDef.path}" description must not be empty`);
    }
  }
  return issues;
}

function projectNarrativeIssues(config: LaymosConfig): string[] {
  if (config.project === undefined) return [];
  const project = config.project;
  const issues: string[] = [];
  if (project.kind !== 'project-narrative') {
    issues.push('Project Narrative has an invalid kind');
  }
  if (project.name.trim().length === 0) {
    issues.push('Project Narrative name must not be empty');
  }

  if (
    project.content.kind !== 'markdown' ||
    project.content.content.trim().length === 0
  ) {
    issues.push('Project Narrative Markdown content must not be empty');
  }
  return issues;
}

function sourceRootIssues(config: LaymosConfig): string[] {
  const issues: string[] = [];
  for (let index = 0; index < config.sourceRoots.length; index++) {
    const root = config.sourceRoots[index]!;
    for (let otherIndex = 0; otherIndex < index; otherIndex++) {
      const other = config.sourceRoots[otherIndex]!;
      if (root === other) {
        issues.push(`Source root "${root}" is declared more than once`);
      } else if (pathContains(root, other) || pathContains(other, root)) {
        issues.push(`Source roots "${other}" and "${root}" overlap`);
      }
    }
  }
  if (config.sourceRoots.length === 0) {
    issues.push('At least one source root is required');
  }

  const configuredPaths = [
    ...layerPathEntries(config).map(([path]) => ['Layer', path] as const),
    ...(config.modules ?? []).map(({ path }) => ['Module', path] as const),
    ...(config.ignore ?? []).map((path) => ['Ignored', path] as const),
  ];
  for (const [kind, path] of configuredPaths) {
    if (!config.sourceRoots.some((root) => pathContains(root, path))) {
      issues.push(`${kind} path "${path}" is not inside any source root`);
    }
  }
  return issues;
}

function duplicateGraphNames(config: LaymosConfig): string[] {
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const graph of config.graphs) {
    if (seen.has(graph.name)) {
      issues.push(`Duplicate graph name "${graph.name}"`);
    }
    seen.add(graph.name);
  }
  return issues;
}

function duplicateLayerNames(config: LaymosConfig): string[] {
  const seen = new Map<string, object>();
  const issues: string[] = [];
  for (const graph of config.graphs) {
    for (const layer of graph.layers) {
      const existing = seen.get(layer.name);
      if (existing && existing !== layer) {
        issues.push(
          `Layer name "${layer.name}" has multiple definitions — define the layer once and reuse the value`,
        );
      }
      seen.set(layer.name, existing ?? layer);
    }
  }
  return issues;
}

function layerPathEntries(config: LaymosConfig): Array<[string, string]> {
  const layers = new Set(config.graphs.flatMap((g) => [...g.layers]));
  return [...layers].flatMap((layer) =>
    layer.paths.map((path): [string, string] => [path, layer.name]),
  );
}

function duplicateLayerPaths(config: LaymosConfig): string[] {
  const seen = new Map<string, string>();
  const issues: string[] = [];
  for (const [path, layerName] of layerPathEntries(config)) {
    const existing = seen.get(path);
    if (existing !== undefined && existing !== layerName) {
      issues.push(
        `Path "${path}" is declared by both layers "${existing}" and "${layerName}"`,
      );
    }
    seen.set(path, existing ?? layerName);
  }
  return issues;
}

function duplicateIgnoredPaths(config: LaymosConfig): string[] {
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const path of config.ignore ?? []) {
    if (seen.has(path)) issues.push(`Duplicate ignored path "${path}"`);
    seen.add(path);
  }
  return issues;
}

function moduleIssues(config: LaymosConfig): string[] {
  const issues: string[] = [];
  const layerPaths = layerPathEntries(config);

  const modules = new Map<string, ModuleDef>();
  for (const def of config.modules ?? []) {
    const path = def.path;
    const existing = modules.get(path);
    if (existing !== undefined) {
      issues.push(`Module "${path}" is declared more than once`);
    } else modules.set(path, def);
  }

  const paths = [...modules.keys()];
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      const [a, b] = [paths[i]!, paths[j]!];
      if (pathContains(a, b) || pathContains(b, a)) {
        issues.push(`Modules "${a}" and "${b}" nest — modules must be flat`);
      }
    }
  }

  for (const path of paths) {
    let best: [string, string] | undefined;
    for (const [layerPath, layerName] of layerPaths) {
      if (
        pathContains(layerPath, path) &&
        (best === undefined || layerPath.length > best[0].length)
      ) {
        best = [layerPath, layerName];
      }
    }
    if (best === undefined) {
      issues.push(`Module "${path}" is not inside any layer`);
      continue;
    }
    for (const [layerPath, layerName] of layerPaths) {
      if (
        path !== layerPath &&
        pathContains(path, layerPath) &&
        layerName !== best[1]
      ) {
        issues.push(
          `Layer "${layerName}" has path "${layerPath}" inside module "${path}" — the module would straddle layers`,
        );
      }
    }
  }

  const seenRules = new Set<string>();
  for (const rule of config.moduleRules ?? []) {
    const from = rule.module.path;
    if (seenRules.has(from)) {
      issues.push(`Module "${from}" has more than one rules declaration`);
    }
    seenRules.add(from);

    if (modules.get(from) !== rule.module) {
      issues.push(
        `Rules module "${from}" must reuse a value declared in config.modules`,
      );
    }

    for (const [ruleName, definitions] of [
      ['canImport', rule.canImport ?? []],
      ['canImportedBy', rule.canImportedBy ?? []],
    ] as const) {
      const seenTargets = new Set<string>();
      for (const def of definitions) {
        const to = def.path;
        if (seenTargets.has(to)) {
          issues.push(
            `Rule ${ruleName} on module "${from}" references module "${to}" more than once`,
          );
        }
        seenTargets.add(to);
        if (modules.get(to) !== def) {
          issues.push(
            `Rule ${ruleName} on module "${from}" must reuse module "${to}" from config.modules`,
          );
        }
      }
    }
  }

  return issues;
}

function unionCycles(config: LaymosConfig): string[] {
  const adjacency = new Map<string, Set<string>>();
  for (const graph of config.graphs) {
    for (const edge of graph.edges) {
      if (!adjacency.has(edge.from.name)) {
        adjacency.set(edge.from.name, new Set());
      }
      adjacency.get(edge.from.name)!.add(edge.to.name);
      if (!adjacency.has(edge.to.name)) {
        adjacency.set(edge.to.name, new Set());
      }
    }
  }

  const index = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  let counter = 0;

  const visit = (node: string): void => {
    index.set(node, counter);
    lowLink.set(node, counter);
    counter++;
    stack.push(node);
    onStack.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        lowLink.set(node, Math.min(lowLink.get(node)!, lowLink.get(next)!));
      } else if (onStack.has(next)) {
        lowLink.set(node, Math.min(lowLink.get(node)!, index.get(next)!));
      }
    }
    if (lowLink.get(node) === index.get(node)) {
      const component: string[] = [];
      let popped: string;
      do {
        popped = stack.pop()!;
        onStack.delete(popped);
        component.push(popped);
      } while (popped !== node);
      if (component.length > 1) {
        cycles.push(component.reverse());
      }
    }
  };

  for (const node of adjacency.keys()) {
    if (!index.has(node)) {
      visit(node);
    }
  }

  return cycles.map(
    (cycle) => `Union cycle: ${cycle.join(' -> ')} -> ${cycle[0]}`,
  );
}
