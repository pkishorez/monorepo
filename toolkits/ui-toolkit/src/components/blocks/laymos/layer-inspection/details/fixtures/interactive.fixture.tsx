import { useFixtureInput } from 'react-cosmos/client';

import {
  FixtureButton,
  FixtureControls,
  FixtureFrame,
} from '../../fixtures/fixture-frame';
import { layers } from '../../fixtures/fixture-data';
import { LayerDetails } from '../index';

function InteractiveDetails() {
  const [activeLayerId, setActiveLayerId] = useFixtureInput<string | null>(
    'active layer',
    'application',
  );
  const layer = layers.find((candidate) => candidate.id === activeLayerId);

  return (
    <FixtureFrame>
      <FixtureControls>
        {layers.map((candidate) => (
          <FixtureButton
            key={candidate.id}
            active={candidate.id === activeLayerId}
            onClick={() => setActiveLayerId(candidate.id)}
          >
            {candidate.id}
          </FixtureButton>
        ))}
        <FixtureButton
          active={activeLayerId === null}
          onClick={() => setActiveLayerId(null)}
        >
          Clear
        </FixtureButton>
      </FixtureControls>
      <LayerDetails className="max-w-xl" layer={layer} />
    </FixtureFrame>
  );
}

export default <InteractiveDetails />;
