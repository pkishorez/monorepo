import { useFixtureInput } from 'react-cosmos/client';
import type { TestsReport } from 'laymos/report';

import { LaymosTests } from '../laymos-tests';
import {
  comprehensiveReport,
  emptyReport,
  jsonDiffReport,
  passingReport,
} from './reports';

function Controlled({
  report,
  initialSelectedModuleId = null,
  running = false,
}: {
  readonly report?: TestsReport;
  readonly initialSelectedModuleId?: string | null;
  readonly running?: boolean;
}) {
  const [selectedModuleId, setSelectedModuleId] = useFixtureInput<
    string | null
  >('selected module', initialSelectedModuleId);

  return (
    <div className="h-[760px] min-w-[960px] p-6">
      <LaymosTests
        report={report}
        selectedModuleId={selectedModuleId}
        onSelectedModuleIdChange={setSelectedModuleId}
        onRunTests={() => undefined}
        running={running}
      />
    </div>
  );
}

export default {
  overview: (
    <Controlled
      report={comprehensiveReport}
      initialSelectedModuleId="checkout-module"
    />
  ),
  'laymos tests': (
    <Controlled
      report={comprehensiveReport}
      initialSelectedModuleId="value-module"
    />
  ),
  'json diff': <Controlled report={jsonDiffReport} />,
  'suite documentation': (
    <Controlled
      report={comprehensiveReport}
      initialSelectedModuleId="value-module"
    />
  ),
  'tests with traces': (
    <Controlled
      report={comprehensiveReport}
      initialSelectedModuleId="trace-module"
    />
  ),
  'collection failure': (
    <Controlled
      report={comprehensiveReport}
      initialSelectedModuleId="collection-error-module"
    />
  ),
  'all passing': <Controlled report={passingReport} />,
  'empty completed run': <Controlled report={emptyReport} />,
  'not run': <Controlled />,
  running: <Controlled running />,
};
