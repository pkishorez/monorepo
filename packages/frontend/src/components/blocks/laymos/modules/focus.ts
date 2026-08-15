import type { Module, ModuleDependency, ModuleViolation } from './model';

export interface ModuleFocus {
  readonly selectedModuleId?: string;
  readonly selectedEntryPointId?: string;
  readonly highlightedModuleIds: ReadonlySet<string>;
  readonly highlightedEntryPointIds: ReadonlySet<string>;
  readonly visibleLayerIds: ReadonlySet<string>;
  readonly dependencies: readonly ModuleDependency[];
  readonly violation?: ModuleViolation;
}

interface ModuleFocusInput {
  readonly modules: readonly Module[];
  readonly dependencies: readonly ModuleDependency[];
  readonly focusedLayerId?: string;
  readonly activeModuleId?: string;
  readonly activeViolation?: ModuleViolation;
}

export function resolveModuleFocus(input: ModuleFocusInput): ModuleFocus {
  const allLayerIds = new Set(input.modules.map(({ layerId }) => layerId));

  if (input.activeViolation !== undefined) {
    const highlightedModuleIds = violationModuleIds(input.activeViolation);
    return {
      highlightedModuleIds,
      highlightedEntryPointIds:
        input.activeViolation.kind === 'missing-entry-point'
          ? new Set([input.activeViolation.entryPointId])
          : new Set(),
      visibleLayerIds: allLayerIds,
      dependencies: [],
      violation: input.activeViolation,
    };
  }

  if (input.activeModuleId === undefined) {
    return {
      highlightedModuleIds: new Set(),
      highlightedEntryPointIds: new Set(),
      visibleLayerIds: allLayerIds,
      dependencies: [],
    };
  }

  const selected = findSelectedModule(input.modules, input.activeModuleId);
  if (selected === undefined) {
    return {
      highlightedModuleIds: new Set(),
      highlightedEntryPointIds: new Set(),
      visibleLayerIds: allLayerIds,
      dependencies: [],
    };
  }

  const selectedDependencies = selected.nested
    ? input.dependencies.filter(
        ({ toEntryPointId }) => toEntryPointId === input.activeModuleId,
      )
    : input.dependencies.filter(
        ({ fromModuleId, toModuleId }) =>
          fromModuleId === selected.module.id ||
          toModuleId === selected.module.id,
      );
  const highlightedModuleIds = new Set([
    selected.module.id,
    ...selectedDependencies.flatMap(({ fromModuleId, toModuleId }) => [
      fromModuleId,
      toModuleId,
    ]),
  ]);
  const highlightedEntryPointIds = new Set(
    selectedDependencies.map(({ toEntryPointId }) => toEntryPointId),
  );

  return {
    selectedModuleId: selected.module.id,
    selectedEntryPointId: input.activeModuleId,
    highlightedModuleIds,
    highlightedEntryPointIds,
    visibleLayerIds: allLayerIds,
    dependencies: selectedDependencies,
  };
}

function findSelectedModule(
  modules: readonly Module[],
  id: string,
): { readonly module: Module; readonly nested: boolean } | undefined {
  const configured = modules.find((module) => module.id === id);
  if (configured !== undefined) return { module: configured, nested: false };
  const parent = modules.find((module) =>
    module.nested.some((nested) => nested.id === id),
  );
  return parent === undefined ? undefined : { module: parent, nested: true };
}

function violationModuleIds(violation: ModuleViolation): ReadonlySet<string> {
  switch (violation.kind) {
    case 'dependency':
    case 'boundary':
      return new Set([violation.fromModuleId, violation.toModuleId]);
    case 'cycle':
      return new Set(violation.moduleIds);
    case 'missing-entry-point':
      return new Set([violation.moduleId]);
    case 'unused-shared':
      return new Set([violation.moduleId]);
    case 'coverage':
      return new Set();
  }
}

export function moduleDependencyId(dependency: ModuleDependency): string {
  return `${dependency.fromModuleId}\0${dependency.toEntryPointId}`;
}
