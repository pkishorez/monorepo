import { FixtureFrame } from '../../../layers/fixtures/fixture-frame';
import {
  moduleDependencies,
  moduleGraphs,
  moduleLayerGraphs,
  moduleLayers,
  moduleRules,
  modules,
  moduleViolations,
} from '../../fixtures/fixture-data';
import { ModuleGraph } from '../index';

const graph = (
  options: {
    readonly activeModuleId?: string;
    readonly activeViolationId?: string;
  } = {},
) => (
  <FixtureFrame className="h-[680px]">
    <ModuleGraph
      className="h-full"
      layers={moduleLayers}
      rules={moduleRules}
      layerGraphs={moduleLayerGraphs}
      modules={modules}
      moduleGraphs={moduleGraphs}
      dependencies={moduleDependencies}
      focusedLayerId="domain"
      showLayerConnections={false}
      activeModuleId={options.activeModuleId}
      activeViolation={moduleViolations.find(
        ({ id }) => id === options.activeViolationId,
      )}
    />
  </FixtureFrame>
);

export default {
  // The band holds every member; dashed edges are the declared Rules.
  band: graph(),
  // The exposed facade, the only member another Layer may import.
  'exposed-member': graph({ activeModuleId: 'src/domain/orders/index.ts' }),
  // A private member, reachable only through a Rule from its own Graph.
  'private-member': graph({ activeModuleId: 'src/domain/orders/pricing' }),
  // A file below the Graph root belonging to no member.
  'graph-coverage-violation': graph({
    activeViolationId: 'orders-graph-loose-file',
  }),
  // A member no Rule reaches and nothing exposes.
  'dead-member': graph({ activeViolationId: 'dead-orders-tax-table' }),
  // A member that is Shared or exposed but has no index.ts.
  'missing-entry-point': graph({
    activeViolationId: 'missing-pricing-entry-point',
  }),
};
