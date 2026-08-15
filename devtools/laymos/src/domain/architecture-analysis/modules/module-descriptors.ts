import type { LayerDefinition } from '../layers/layers.js';
import type {
  AnalyzedModule,
  ModuleDefinition,
  ModuleDependency,
  ModuleShape,
  ObservedModuleKind,
} from './modules.js';

export function describeModules(
  modules: Readonly<Record<string, ModuleDefinition>>,
  layers: Readonly<Record<string, LayerDefinition>>,
  dependencies: readonly ModuleDependency[],
): readonly AnalyzedModule[] {
  const incoming = new Set(dependencies.map(({ toModule }) => toModule));
  const outgoing = new Set(dependencies.map(({ fromModule }) => fromModule));
  return Object.entries(modules).map(([path, definition]) => ({
    path,
    layer: findLayer(path, layers),
    kind: definition.kind,
    shape: moduleShape(path),
    observedKind: observedModuleKind(incoming.has(path), outgoing.has(path)),
    subpaths: definition.subpaths,
  }));
}

function findLayer(
  module: string,
  layers: Readonly<Record<string, LayerDefinition>>,
): string {
  return Object.entries(layers).find(([, definition]) =>
    definition.paths.some((scope) => contains(scope, module)),
  )![0];
}

function contains(parent: string, child: string): boolean {
  return parent === '.' || child === parent || child.startsWith(`${parent}/`);
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
