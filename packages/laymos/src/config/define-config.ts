import type { LaymosConfig, ModuleDef } from './types.js';
import { normalizeConfigPath, pathContains } from './path.js';

export function defineConfig(config: LaymosConfig): LaymosConfig {
  const normalizedConfig: LaymosConfig = {
    ...config,
    ...(config.ignore !== undefined
      ? { ignore: config.ignore.map(normalizeConfigPath) }
      : {}),
  };
  const issues = [
    ...duplicateGraphNames(normalizedConfig),
    ...duplicateLayerNames(normalizedConfig),
    ...duplicateLayerPaths(normalizedConfig),
    ...duplicateIgnoredPaths(normalizedConfig),
    ...nonSinkSharedLayers(normalizedConfig),
    ...unionCycles(normalizedConfig),
    ...moduleIssues(normalizedConfig),
  ];
  if (issues.length > 0) {
    throw new Error(
      `Invalid laymos config:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
    );
  }
  return normalizedConfig;
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

function nonSinkSharedLayers(config: LaymosConfig): string[] {
  const memberships = new Map<string, string[]>();
  const outgoing = new Set<string>();
  for (const graph of config.graphs) {
    for (const layer of graph.layers) {
      memberships.set(layer.name, [
        ...(memberships.get(layer.name) ?? []),
        graph.name,
      ]);
    }
    for (const edge of graph.edges) {
      outgoing.add(edge.from.name);
    }
  }
  const issues: string[] = [];
  for (const [layer, graphs] of memberships) {
    if (graphs.length > 1 && outgoing.has(layer)) {
      issues.push(
        `Layer "${layer}" appears in graphs ${graphs.map((g) => `"${g}"`).join(', ')} but has outgoing edges — a layer in multiple graphs must be a sink`,
      );
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
