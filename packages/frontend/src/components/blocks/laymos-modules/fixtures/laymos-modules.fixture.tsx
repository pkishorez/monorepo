import { useFixtureInput } from 'react-cosmos/client';
import type { LaymosReport } from 'laymos/report';

import type { LaymosModuleSelection } from '../types';
import {
  complexModulesFixtureReport,
  denseModulesFixtureReport,
  laymosModulesFixtureReport,
} from './reports';
import { LaymosModules } from '../components/laymos-modules';

function Controlled({
  report = laymosModulesFixtureReport,
  initialSelected = null,
}: {
  readonly report?: LaymosReport;
  readonly initialSelected?: LaymosModuleSelection | null;
}) {
  const [selectedModule, setSelectedModule] =
    useFixtureInput<LaymosModuleSelection | null>(
      'selected module',
      initialSelected,
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
  overview: <Controlled />,
  'direct selection': (
    <Controlled
      initialSelected={{ path: 'src/application/home', depth: 'direct' }}
    />
  ),
  'dense architecture': <Controlled report={denseModulesFixtureReport} />,
  'clustered architecture': <Controlled report={complexModulesFixtureReport} />,
};
