import { useFixtureInput } from 'react-cosmos/client';
import type { LaymosReport } from 'laymos/report';

import type { LaymosModuleSelection } from '../../laymos-modules';
import {
  complexModulesFixtureReport,
  denseModulesFixtureReport,
  laymosModulesFixtureReport,
} from '../../laymos-modules/fixtures/reports';
import { buildLaymosModulesModel } from '../../laymos-modules/lib/model';
import { LaymosModulesView2 } from '../components/laymos-modules-view2';
import { ModuleFocusDialog } from '../components/module-focus-dialog';

const fixtureModel = buildLaymosModulesModel(laymosModulesFixtureReport);

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
      <LaymosModulesView2
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

function FocusedDialog() {
  const [modulePath, setModulePath] = useFixtureInput<string | null>(
    'dialog module',
    'src/application/home',
  );
  const [transitive, setTransitive] = useFixtureInput('transitive', false);
  return (
    <div className="h-[920px] w-full min-w-[960px]">
      <ModuleFocusDialog
        model={fixtureModel}
        modulePath={modulePath}
        transitive={transitive}
        onModulePathChange={setModulePath}
        onTransitiveChange={setTransitive}
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
  'transitive selection': (
    <Controlled
      initialSelected={{ path: 'src/application/home', depth: 'transitive' }}
    />
  ),
  'focused dialog': <FocusedDialog />,
  'dense architecture': <Controlled report={denseModulesFixtureReport} />,
  'complex architecture': <Controlled report={complexModulesFixtureReport} />,
};
