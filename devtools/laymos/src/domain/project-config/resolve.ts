import { posix } from 'node:path';

import type {
  Config,
  ModuleDefinition,
  ModuleGraphDefinition,
} from '../../architecture-analysis-schema/index.js';

export interface ResolvedConfig {
  readonly modules: Readonly<Record<string, ModuleDefinition>>;
  readonly graphs: Readonly<Record<string, ModuleGraphDefinition>>;
}

export function resolveConfig(config: Config): ResolvedConfig {
  const modules: Record<string, ModuleDefinition> = {};
  const graphs: Record<string, ModuleGraphDefinition> = {};
  for (const [layer, definition] of Object.entries(config.layers)) {
    for (const [path, module] of Object.entries(definition.modules)) {
      modules[path] = { layer, shared: module.shared, exposed: module.exposed };
    }
    for (const [id, graph] of Object.entries(definition.moduleGraphs)) {
      const members: Record<string, string> = {};
      for (const [member, module] of Object.entries(graph.modules)) {
        const path = memberPath(graph.path, member);
        members[member] = path;
        modules[path] = {
          layer,
          shared: module.shared,
          exposed: module.exposed,
          graph: id,
          member,
        };
      }
      graphs[id] = { layer, path: graph.path, members, rules: graph.rules };
    }
  }
  return { modules, graphs };
}

export function memberPath(graphPath: string, member: string): string {
  return graphPath === '.' ? member : posix.join(graphPath, member);
}
