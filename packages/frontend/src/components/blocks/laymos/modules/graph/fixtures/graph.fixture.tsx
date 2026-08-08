import { FixtureFrame } from '../../../layers/fixtures/fixture-frame';
import {
  moduleDependencies,
  moduleLayerGraphs,
  moduleLayers,
  moduleRules,
  modules,
  moduleViolations,
} from '../../fixtures/fixture-data';
import { ModuleGraph } from '../index';

const graph = (
  focusedLayerId: string,
  options: {
    readonly activeModuleId?: string;
    readonly activeViolationId?: string;
    readonly showLayerConnections?: boolean;
  } = {},
) => (
  <FixtureFrame className="h-[680px]">
    <ModuleGraph
      className="h-full"
      layers={moduleLayers}
      rules={moduleRules}
      layerGraphs={moduleLayerGraphs}
      modules={modules}
      dependencies={moduleDependencies}
      focusedLayerId={focusedLayerId}
      showLayerConnections={options.showLayerConnections ?? true}
      activeModuleId={options.activeModuleId}
      activeViolation={moduleViolations.find(
        ({ id }) => id === options.activeViolationId,
      )}
    />
  </FixtureFrame>
);

export default {
  baseline: graph('application'),
  connected: graph('application', {
    activeModuleId: 'src/application/orders',
  }),
  'without-layer-connections': graph('application', {
    activeModuleId: 'src/application/orders',
    showLayerConnections: false,
  }),
  nested: graph('domain', {
    activeModuleId: 'src/domain/orders/events',
  }),
  violation: graph('domain', {
    activeViolationId: 'missing-pricing-entry-point',
  }),
};
