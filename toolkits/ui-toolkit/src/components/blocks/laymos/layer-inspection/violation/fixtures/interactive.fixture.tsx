import { useFixtureInput } from 'react-cosmos/client';

import { FixtureFrame } from '../../fixtures/fixture-frame';
import {
  coverageViolations,
  violationPairs,
} from '../../fixtures/fixture-data';
import { LayerViolationsList } from '../index';

function InteractiveViolations() {
  const [activeViolationGroupId, setActiveViolationGroupId] = useFixtureInput<
    string | null
  >('active violation group', null);

  return (
    <FixtureFrame>
      <LayerViolationsList
        className="max-w-2xl"
        violationPairs={violationPairs}
        coverageViolations={coverageViolations}
        activeViolationGroupId={activeViolationGroupId ?? undefined}
        onActiveViolationGroupChange={(id) =>
          setActiveViolationGroupId(id ?? null)
        }
      />
    </FixtureFrame>
  );
}

export default <InteractiveViolations />;
