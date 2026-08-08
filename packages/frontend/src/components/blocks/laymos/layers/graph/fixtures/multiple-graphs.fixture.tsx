import { useFixtureInput } from 'react-cosmos/client';

import {
  complexLayerGraphs,
  complexLayers,
  complexRules,
} from '../../fixtures/complex-fixture-data';
import { FixtureFrame } from '../../fixtures/fixture-frame';
import { LayerGraph } from '../index';

const allGraphsId = 'all';

function MultipleGraphs() {
  const [activeGraphId, setActiveGraphId] = useFixtureInput(
    'layer graph',
    allGraphsId,
  );
  const [activeLayerId, setActiveLayerId] = useFixtureInput<string | null>(
    'active layer',
    null,
  );
  const [hoveredLayerId, setHoveredLayerId] = useFixtureInput<string | null>(
    'hovered layer',
    null,
  );

  const selectedGraph = complexLayerGraphs.find(
    (graph) => graph.id === activeGraphId,
  );
  const visibleRules = selectedGraph?.rules ?? complexRules;
  const visibleLayerCount = new Set(
    visibleRules.flatMap((rule) => [rule.fromLayerId, ...rule.toLayerIds]),
  ).size;
  const clearFocus = () => {
    setActiveLayerId(null);
    setHoveredLayerId(null);
  };

  return (
    <FixtureFrame className="h-[820px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <select
            aria-label="Layer graph"
            className="h-9 min-w-52 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            value={activeGraphId}
            onChange={(event) => {
              clearFocus();
              setActiveGraphId(event.target.value);
            }}
          >
            <option value={allGraphsId}>All LayerGraphs</option>
            {complexLayerGraphs.map((graph) => (
              <option key={graph.id} value={graph.id}>
                {graph.id}
              </option>
            ))}
          </select>
          <p className="truncate text-xs text-muted-foreground">
            {selectedGraph?.description ??
              'Three independent graphs, nine roots, and nineteen layers.'}
          </p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {selectedGraph === undefined
            ? complexLayers.length
            : visibleLayerCount}{' '}
          layers · {visibleRules.length} rule groups
        </span>
      </div>

      <LayerGraph
        className="h-[745px]"
        layers={complexLayers}
        rules={visibleRules}
        layerGraphs={complexLayerGraphs}
        activeLayerGraphId={selectedGraph?.id}
        activeLayerId={activeLayerId ?? undefined}
        hoveredLayerId={hoveredLayerId ?? undefined}
        onLayerHoverChange={(layerId) => setHoveredLayerId(layerId ?? null)}
        onLayerActivate={(layerId) => {
          setHoveredLayerId(null);
          setActiveLayerId(layerId);
        }}
        onClearFocus={clearFocus}
      />
    </FixtureFrame>
  );
}

export default <MultipleGraphs />;
