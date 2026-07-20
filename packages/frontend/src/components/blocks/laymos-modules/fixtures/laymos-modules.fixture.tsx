import { useFixtureInput } from 'react-cosmos/client';
import type { LaymosReport } from 'laymos/report';

import { LaymosModules } from '../components/laymos-modules';
import type { LaymosModuleSelection } from '../types';
import {
  complexModulesFixtureReport,
  denseModulesFixtureReport,
  laymosModulesFixtureReport,
} from './reports';

function Controlled({
  report = laymosModulesFixtureReport,
  initialSelected = null,
  initialHovered = null,
  initialFocused = null,
}: {
  report?: LaymosReport;
  initialSelected?: LaymosModuleSelection | null;
  initialHovered?: string | null;
  initialFocused?: string | null;
}) {
  const [selectedModule, setSelectedModule] =
    useFixtureInput<LaymosModuleSelection | null>(
      'selected module',
      initialSelected,
    );
  const [hoveredModule, setHoveredModule] = useFixtureInput<string | null>(
    'hovered module',
    initialHovered,
  );
  const [focusedModule, setFocusedModule] = useFixtureInput<string | null>(
    'focused module',
    initialFocused,
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
        defaultMinimise
      />
    </div>
  );
}

export default {
  overview: <Controlled />,
  'hover preview': <Controlled initialHovered="src/application/home" />,
  'direct selection': (
    <Controlled
      initialSelected={{ path: 'src/application/home', depth: 'direct' }}
    />
  ),
  'transitive selection': (
    <Controlled
      initialSelected={{ path: 'src/application/home', depth: 'transitive' }}
    />
  ),
  'transitive comparison': (
    <Controlled
      initialSelected={{ path: 'src/application/home', depth: 'transitive' }}
      initialHovered="src/platform/log"
    />
  ),
  'cycle comparison': (
    <Controlled
      initialSelected={{ path: 'src/application/home', depth: 'transitive' }}
      initialHovered="src/domain/user"
    />
  ),
  'dense architecture': (
    <Controlled
      report={denseModulesFixtureReport}
      initialSelected={{
        path: 'src/routes/capability-1',
        depth: 'transitive',
      }}
    />
  ),
  'complex layer graphs': (
    <Controlled
      report={complexModulesFixtureReport}
      initialSelected={{
        path: 'src/routes/capability-1',
        depth: 'transitive',
      }}
    />
  ),
};
