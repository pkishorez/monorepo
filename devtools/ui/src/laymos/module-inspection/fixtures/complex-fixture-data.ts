import {
  complexLayers,
  complexRules,
} from '../../layer-inspection/fixtures/complex-fixture-data';
import type { Module, ModuleDependency } from '../../analysis-presentation';

interface ModuleDetails {
  readonly shared?: boolean;
}

interface ModuleSeed {
  readonly id: string;
  readonly layerId: string;
  readonly shared: boolean;
  readonly exposed: boolean;
}

const detailsByModuleId: Readonly<Record<string, ModuleDetails>> = {
  'packages/experience/navigation': { shared: true },
  'services/commerce/workflows': { shared: true },
  'packages/commerce/shared-domain': { shared: true },
};

const moduleSeeds: readonly ModuleSeed[] = complexLayers.flatMap((layer) =>
  layer.scopes.map((scope) => {
    const details = detailsByModuleId[scope.path];
    return {
      id: scope.path,
      layerId: layer.id,
      shared: details?.shared ?? false,
      exposed: true,
    };
  }),
);

const primaryModuleByLayer = new Map(
  complexLayers.map((layer) => [layer.id, layer.scopes[0]!.path]),
);

const ruleDependencies = complexRules.flatMap((rule) =>
  rule.toLayerIds.map((toLayerId) =>
    dependency(
      primaryModuleByLayer.get(rule.fromLayerId)!,
      primaryModuleByLayer.get(toLayerId)!,
    ),
  ),
);

export const complexModuleDependencies: readonly ModuleDependency[] = [
  ...ruleDependencies,
  dependency('packages/experience/shell', 'packages/experience/navigation'),
  dependency('packages/commerce/application', 'services/commerce/workflows'),
  dependency(
    'packages/commerce/application',
    'packages/commerce/domain',
    'packages/commerce/domain/orders/events',
  ),
  dependency('packages/commerce/domain', 'packages/commerce/shared-domain'),
  dependency(
    'packages/operations/automation',
    'packages/operations/runtime',
    'packages/operations/runtime/jobs/events',
  ),
  dependency(
    'services/insights/stream',
    'packages/insights/pipeline',
    'packages/insights/pipeline/transforms/events',
  ),
];

export const complexModules: readonly Module[] = moduleSeeds.map((module) => ({
  ...module,
  kind: topologyKind(module.id, complexModuleDependencies),
}));

function dependency(
  fromModuleId: string,
  toModuleId: string,
  toEntryPointId = toModuleId,
): ModuleDependency {
  return { fromModuleId, toModuleId, toEntryPointId, permitted: true };
}

function topologyKind(
  moduleId: string,
  dependencies: readonly ModuleDependency[],
): Module['kind'] {
  const incoming = dependencies.some(
    (dependency) => dependency.toModuleId === moduleId,
  );
  const outgoing = dependencies.some(
    (dependency) => dependency.fromModuleId === moduleId,
  );
  if (incoming && outgoing) return 'regular';
  if (outgoing) return 'root';
  if (incoming) return 'terminal';
  return 'isolated';
}
