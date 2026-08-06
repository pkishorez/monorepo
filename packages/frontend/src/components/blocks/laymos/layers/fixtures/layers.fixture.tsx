import { useFixtureInput } from 'react-cosmos/client';

import {
  complexCoverageViolations,
  complexLayerGraphs,
  complexLayers,
  complexRules,
  complexViolationPairs,
} from './complex-fixture-data';
import { LayerDetails } from '../details';
import { resolveLayerFocus } from '../focus';
import { LayerGraph } from '../graph';
import { layersReferencedByRules } from '../layer-graphs';
import { LayerScopeTree } from '../tree';
import { LayerViolationsList } from '../violation';

const allGraphsId = 'all';

function LayersExperience() {
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
  const [activeViolationGroupId, setActiveViolationGroupId] = useFixtureInput<
    string | null
  >('active violation group', null);

  const selectedGraph = complexLayerGraphs.find(
    (graph) => graph.id === activeGraphId,
  );
  const visibleRules = selectedGraph?.rules ?? complexRules;
  const visibleLayers =
    selectedGraph === undefined
      ? complexLayers
      : layersReferencedByRules(complexLayers, visibleRules);
  const visibleLayerIds = new Set(visibleLayers.map((layer) => layer.id));
  const visibleViolationPairs = complexViolationPairs.filter(
    (pair) =>
      visibleLayerIds.has(pair.fromLayerId) &&
      visibleLayerIds.has(pair.toLayerId),
  );
  const visibleCoverageViolations =
    selectedGraph === undefined ? complexCoverageViolations : [];
  const visibleViolationCount =
    visibleViolationPairs.reduce(
      (count, pair) => count + pair.violations.length,
      0,
    ) + visibleCoverageViolations.length;
  const activeViolationPair = visibleViolationPairs.find(
    (pair) => pair.id === activeViolationGroupId,
  );
  const violationActive = activeViolationPair !== undefined;
  const focus = resolveLayerFocus({
    activeLayerId: activeLayerId ?? undefined,
    hoveredLayerId: hoveredLayerId ?? undefined,
    blocked: violationActive,
  });
  const focusedLayer = visibleLayers.find(
    (layer) => layer.id === focus.focusedLayerId,
  );

  const clearFocus = () => {
    setHoveredLayerId(null);
    setActiveLayerId(null);
    setActiveViolationGroupId(null);
  };
  const activateLayer = (layerId: string) => {
    setHoveredLayerId(null);
    setActiveViolationGroupId(null);
    setActiveLayerId(layerId);
  };
  const hoverLayer = (layerId: string | undefined) => {
    if (focus.hoverEnabled) setHoveredLayerId(layerId ?? null);
  };
  const activateViolation = (groupId: string | undefined) => {
    setHoveredLayerId(null);
    if (visibleViolationPairs.some((pair) => pair.id === groupId)) {
      setActiveLayerId(null);
    }
    setActiveViolationGroupId(groupId ?? null);
  };

  return (
    <main className="min-h-screen bg-muted/20 p-3 sm:p-5">
      <div className="mx-auto max-w-[1600px] overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight">
              Project layers
            </h1>
            <p className="text-xs text-muted-foreground">
              Trace direct rules, inspect scopes, and review violations.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
              {visibleLayers.length} layers · {visibleViolationCount}{' '}
              {visibleViolationCount === 1 ? 'violation' : 'violations'}
            </span>
            <select
              aria-label="Layer graph"
              className="h-9 min-w-48 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
          </div>
        </header>

        <div className="grid min-h-[760px] lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-[560px] min-w-0 flex-col lg:min-h-0">
            <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border px-4">
              <p className="truncate text-xs text-muted-foreground">
                {selectedGraph?.description ??
                  'All direct rules across three independent LayerGraphs.'}
              </p>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                Pan · zoom · select
              </span>
            </div>
            <LayerGraph
              className="min-h-[515px] flex-1 rounded-none border-0"
              layers={visibleLayers}
              rules={visibleRules}
              activeLayerId={activeLayerId ?? undefined}
              hoveredLayerId={hoveredLayerId ?? undefined}
              activeViolationPair={activeViolationPair}
              onLayerHoverChange={hoverLayer}
              onLayerActivate={activateLayer}
              onClearFocus={clearFocus}
            />
          </section>

          <aside className="min-w-0 border-t border-border lg:border-s lg:border-t-0">
            <section className="min-h-28 border-b border-border p-4">
              <SectionLabel>Selection</SectionLabel>
              <LayerDetails layer={focusedLayer} />
            </section>
            <section className="max-h-[360px] overflow-y-auto border-b border-border p-4 lg:h-[360px]">
              <SectionLabel>Scopes</SectionLabel>
              <LayerScopeTree
                layers={visibleLayers}
                activeLayerId={
                  violationActive ? undefined : (activeLayerId ?? undefined)
                }
                hoveredLayerId={
                  violationActive ? undefined : (hoveredLayerId ?? undefined)
                }
                onLayerHoverChange={hoverLayer}
                onLayerActivate={activateLayer}
              />
            </section>
            <section className="max-h-[300px] overflow-y-auto p-4">
              <SectionLabel>Violations</SectionLabel>
              <LayerViolationsList
                violationPairs={visibleViolationPairs}
                coverageViolations={visibleCoverageViolations}
                activeViolationGroupId={activeViolationGroupId ?? undefined}
                onActiveViolationGroupChange={activateViolation}
              />
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function SectionLabel({ children }: { readonly children: string }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

export default <LayersExperience />;
