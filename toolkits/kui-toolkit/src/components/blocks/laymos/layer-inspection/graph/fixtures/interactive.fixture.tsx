import { useFixtureInput } from 'react-cosmos/client';

import {
  FixtureButton,
  FixtureControls,
  FixtureFrame,
} from '../../fixtures/fixture-frame';
import { layers, rules, violationPairs } from '../../fixtures/fixture-data';
import { LayerGraph } from '../index';

function InteractiveGraph() {
  const [activeLayerId, setActiveLayerId] = useFixtureInput<string | null>(
    'active layer',
    null,
  );
  const [hoveredLayerId, setHoveredLayerId] = useFixtureInput<string | null>(
    'hovered layer',
    null,
  );
  const [showViolation, setShowViolation] = useFixtureInput(
    'show violation',
    false,
  );
  const activateLayer = (layerId: string) => {
    setHoveredLayerId(null);
    setActiveLayerId(layerId);
  };
  const clearFocus = () => {
    setActiveLayerId(null);
    setHoveredLayerId(null);
    setShowViolation(false);
  };

  return (
    <FixtureFrame className="h-[720px]">
      <FixtureControls>
        <FixtureButton
          active={activeLayerId === 'application' && !showViolation}
          onClick={() => {
            setShowViolation(false);
            activateLayer('application');
          }}
        >
          Activate application
        </FixtureButton>
        <FixtureButton
          active={showViolation}
          onClick={() => setShowViolation(!showViolation)}
        >
          {showViolation ? 'Hide violation' : 'Show violation'}
        </FixtureButton>
        <FixtureButton onClick={clearFocus}>Clear</FixtureButton>
        <span className="text-xs text-muted-foreground">
          Hover or select a node to trace its direct rules.
        </span>
      </FixtureControls>
      <LayerGraph
        className="h-[640px]"
        layers={layers}
        rules={rules}
        activeLayerId={activeLayerId ?? undefined}
        hoveredLayerId={hoveredLayerId ?? undefined}
        activeViolationPair={showViolation ? violationPairs[0] : undefined}
        onLayerHoverChange={(layerId) => setHoveredLayerId(layerId ?? null)}
        onLayerActivate={activateLayer}
        onClearFocus={clearFocus}
      />
    </FixtureFrame>
  );
}

export default <InteractiveGraph />;
