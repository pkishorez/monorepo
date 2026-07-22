import { useFixtureInput } from 'react-cosmos/client';
import type { LaymosReport } from 'laymos/report';

import type { LaymosModuleSelection } from '../types';
import { LaymosModules } from '../components/laymos-modules';
import {
  denseModuleArchitectureReport,
  moduleArchitectureReport,
} from './reports';

function ControlledModules({
  report = moduleArchitectureReport,
  initialSelection = null,
}: {
  readonly report?: LaymosReport;
  readonly initialSelection?: LaymosModuleSelection | null;
}) {
  const [selectedModule, setSelectedModule] =
    useFixtureInput<LaymosModuleSelection | null>(
      'selected module',
      initialSelection,
    );
  const [hoveredModule, setHoveredModule] = useFixtureInput<string | null>(
    'hovered module',
    null,
  );
  const [focusedModule, setFocusedModule] = useFixtureInput<string | null>(
    'focused module',
    null,
  );
  return (
    <div className="h-[920px] w-full min-w-[960px]">
      <LaymosModules
        report={report}
        selectedModule={selectedModule}
        onSelectedModuleChange={setSelectedModule}
        hoveredModule={hoveredModule}
        onHoveredModuleChange={setHoveredModule}
        focusedModule={focusedModule}
        onFocusedModuleChange={setFocusedModule}
      />
    </div>
  );
}

export default {
  orientation: <ControlledModules />,
  'direct selection': (
    <ControlledModules
      initialSelection={{ path: 'src/application/orders', depth: 'direct' }}
    />
  ),
  'transitive selection': (
    <ControlledModules
      initialSelection={{ path: 'src/ui/orders', depth: 'transitive' }}
    />
  ),
  'dense architecture': (
    <ControlledModules report={denseModuleArchitectureReport} />
  ),
};
