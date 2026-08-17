import type { ResolvedConfig } from '../../project-config/index.js';
import type {
  AnalyzedModule,
  AnalyzedModuleGraph,
  ModuleDependency,
  ModuleShape,
  ObservedModuleKind,
} from './modules.js';

export function describeModules(
  modules: ResolvedConfig['modules'],
  dependencies: readonly ModuleDependency[],
): readonly AnalyzedModule[] {
  const incoming = new Set(dependencies.map(({ toModule }) => toModule));
  const outgoing = new Set(dependencies.map(({ fromModule }) => fromModule));
  return Object.entries(modules).map(([path, definition]) => ({
    path,
    layer: definition.layer,
    shared: definition.shared,
    exposed: definition.exposed,
    shape: moduleShape(path),
    observedKind: observedModuleKind(incoming.has(path), outgoing.has(path)),
    ...(definition.graph === undefined ? {} : { graph: definition.graph }),
    ...(definition.member === undefined ? {} : { member: definition.member }),
  }));
}

export function describeModuleGraphs(
  graphs: ResolvedConfig['graphs'],
): readonly AnalyzedModuleGraph[] {
  return Object.entries(graphs)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, graph]) => ({
      id,
      layer: graph.layer,
      path: graph.path,
      members: Object.values(graph.members).sort(),
      rules: graph.rules,
    }));
}

function moduleShape(path: string): ModuleShape {
  return /\.(?:[cm]?[jt]sx?)$/.test(path) ? 'file' : 'directory';
}

function observedModuleKind(
  incoming: boolean,
  outgoing: boolean,
): ObservedModuleKind {
  if (incoming && outgoing) return 'regular';
  if (outgoing) return 'root';
  if (incoming) return 'terminal';
  return 'isolated';
}
