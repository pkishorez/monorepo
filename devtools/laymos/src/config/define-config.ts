import type { LaymosConfig, ModuleDef } from './types.js';
import type { ProjectTopicDef } from '../story/core/project-narrative.js';
import { normalizeConfigPath, pathContains } from './path.js';

export function defineConfig(config: LaymosConfig): LaymosConfig {
  const normalizedConfig: LaymosConfig = {
    ...config,
    sourceRoots: config.sourceRoots.map(normalizeConfigPath),
    ...(config.ignore !== undefined
      ? { ignore: config.ignore.map(normalizeConfigPath) }
      : {}),
  };
  const issues = [
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
  if (issues.length > 0) {
    throw new Error(
      `Invalid laymos config:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
    );
  }
  return normalizedConfig;
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

  const graphs = new Set(config.graphs);
  const layers = new Set(config.graphs.flatMap((graph) => graph.layers));
  const modules = new Set(config.modules ?? []);
  for (const block of project.blocks) {
    if (block.kind === 'markdown') {
      if (block.content.trim().length === 0) {
        issues.push('Project Narrative Markdown blocks must not be empty');
      }
    } else if (block.kind === 'project-map') {
      validateProjectTopic(block.root, graphs, layers, modules, [], issues);
    } else {
      issues.push('Project Narrative contains an unknown block');
    }
  }
  return issues;
}

function validateProjectTopic(
  topic: ProjectTopicDef,
  graphs: ReadonlySet<LaymosConfig['graphs'][number]>,
  layers: ReadonlySet<LaymosConfig['graphs'][number]['layers'][number]>,
  modules: ReadonlySet<ModuleDef>,
  ancestors: readonly string[],
  issues: string[],
): void {
  const path = [...ancestors, topic.title];
  const label = path.join(' / ');
  if (topic.title.trim().length === 0) {
    issues.push('Project Topic title must not be empty');
  }
  if (topic.description.content.trim().length === 0) {
    issues.push(`Project Topic "${label}" description must not be empty`);
  }
  for (const reference of topic.references) {
    const declared =
      reference.kind === 'layer-graph'
        ? graphs.has(reference)
        : reference.kind === 'layer'
          ? layers.has(reference)
          : modules.has(reference);
    if (!declared) {
      const identity =
        reference.kind === 'module' ? reference.path : reference.name;
      issues.push(
        `Project Topic "${label}" must reuse declared ${reference.kind} "${identity}"`,
      );
    }
  }
  const siblings = new Set<string>();
  for (const child of topic.children) {
    if (siblings.has(child.title)) {
      issues.push(
        `Project Topic "${label}" has duplicate child "${child.title}"`,
      );
    }
    siblings.add(child.title);
    validateProjectTopic(child, graphs, layers, modules, path, issues);
  }
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
