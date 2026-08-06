import { useFixtureInput } from 'react-cosmos/client';

import {
  FixtureButton,
  FixtureControls,
  FixtureFrame,
} from '../../fixtures/fixture-frame';
import { complexLayers } from '../../fixtures/complex-fixture-data';
import { LayerScopeTree } from '../index';

function InteractiveTree() {
  const [activeLayerId, setActiveLayerId] = useFixtureInput<string | null>(
    'active layer',
    null,
  );
  const [hoveredLayerId, setHoveredLayerId] = useFixtureInput<string | null>(
    'hovered layer',
    null,
  );
  const activateLayer = (layerId: string) => {
    setHoveredLayerId(null);
    setActiveLayerId(layerId);
  };

  return (
    <FixtureFrame>
      <FixtureControls>
        {['web-client', 'commerce-app', 'job-runtime', 'stream-consumer'].map(
          (layerId) => (
            <FixtureButton
              key={layerId}
              active={activeLayerId === layerId}
              onClick={() => activateLayer(layerId)}
            >
              Select {layerId}
            </FixtureButton>
          ),
        )}
        <FixtureButton
          onClick={() => {
            setActiveLayerId(null);
            setHoveredLayerId(null);
          }}
        >
          Clear selection
        </FixtureButton>
        <span className="text-xs text-muted-foreground">
          Selection centers the first configured folder for that layer.
        </span>
      </FixtureControls>
      <LayerScopeTree
        className="h-72 max-w-xl overflow-y-auto rounded-lg border border-border p-2"
        layers={complexLayers}
        activeLayerId={activeLayerId ?? undefined}
        hoveredLayerId={hoveredLayerId ?? undefined}
        onLayerHoverChange={(layerId) => setHoveredLayerId(layerId ?? null)}
        onLayerActivate={activateLayer}
      />
    </FixtureFrame>
  );
}

export default <InteractiveTree />;
