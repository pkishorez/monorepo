import { FixtureFrame } from '../../../layers/fixtures/fixture-frame';
import {
  moduleDependencies,
  moduleLayerGraphs,
  moduleLayers,
  moduleRules,
  moduleGraphs,
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
    readonly showModuleConnections?: boolean;
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
      focusedLayerId={focusedLayerId}
      showLayerConnections={options.showLayerConnections ?? true}
      showModuleConnections={options.showModuleConnections ?? true}
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
  'without-module-connections': graph('application', {
    showModuleConnections: false,
  }),
  'module-connections-on-select': graph('application', {
    showModuleConnections: false,
    activeModuleId: 'src/application/orders',
  }),
  'module-graph-member': graph('domain', {
    activeModuleId: 'src/domain/orders/index.ts',
  }),
  violation: graph('domain', {
    activeViolationId: 'missing-pricing-entry-point',
  }),
};
