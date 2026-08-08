import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ArchitectureAnalysis } from 'laymos';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#components/ui/resizable';
import { Switch } from '#components/ui/switch';
import { ArrowLeft } from '#lib/lucide';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import { resolveLayerFocus } from './layers/focus';
import { LayerGraph } from './layers/graph';
import {
  layersReferencedByRules,
  type NamedLayerGraph,
} from './layers/layer-graphs';
import type { Layer, LayerRule } from './layers/model';
import { LayerScopeTree } from './layers/tree';
import { coverageGroupId, LayerViolationsList } from './layers/violation';
import { resolveModuleFocus } from './modules/focus';
import { ModuleGraph } from './modules/graph';
import type {
  Module,
  ModuleDependency,
  ModuleViolation,
} from './modules/model';
import { ModuleLegend } from './modules/legend';
import { ModuleTree } from './modules/tree';
import { ModuleViolationsList } from './modules/violation';
import {
  ModuleSourceExplorer,
  moduleSourceRequest,
  type LoadModuleSource,
  type ModuleSourceOpenRequest,
} from './module-source-explorer';
import { buildPresentationModel } from './presentation-model';
import { ArchitectureTreeLegend } from './tree';
import { layerIdsByBoundaryPath } from './tree/presentation';

const allGraphsId = 'all';

export function LaymosExperience({
  analysis,
  loadModuleSource,
  className,
}: {
  readonly analysis: ArchitectureAnalysis;
  readonly loadModuleSource: LoadModuleSource;
  readonly className?: string;
}) {
  const model = useMemo(() => buildPresentationModel(analysis), [analysis]);
  const [openedLayerId, setOpenedLayerId] = useState<string>();
  const [activeGraphId, setActiveGraphId] = useState(allGraphsId);
  const [activeLayerId, setActiveLayerId] = useState<string>();
  const [hoveredLayerId, setHoveredLayerId] = useState<string>();
  const [activeViolationId, setActiveViolationId] = useState<string>();

  useEffect(() => {
    const layerIds = new Set(model.layers.map(({ id }) => id));
    const graphIds = new Set(model.layerGraphs.map(({ id }) => id));
    const violationIds = new Set(model.layerViolationPairs.map(({ id }) => id));
    if (model.layerCoverageViolations.length > 0) {
      violationIds.add(coverageGroupId);
    }
    if (openedLayerId !== undefined && !layerIds.has(openedLayerId)) {
      setOpenedLayerId(undefined);
    }
    if (activeLayerId !== undefined && !layerIds.has(activeLayerId)) {
      setActiveLayerId(undefined);
    }
    if (activeGraphId !== allGraphsId && !graphIds.has(activeGraphId)) {
      setActiveGraphId(allGraphsId);
    }
    if (
      activeViolationId !== undefined &&
      !violationIds.has(activeViolationId)
    ) {
      setActiveViolationId(undefined);
    }
  }, [activeGraphId, activeLayerId, activeViolationId, model, openedLayerId]);

  if (openedLayerId !== undefined) {
    return (
      <ModulesExperience
        className={className}
        layers={model.layers}
        rules={model.rules}
        layerGraphs={model.layerGraphs}
        modules={model.modules}
        dependencies={model.moduleDependencies}
        violations={model.moduleViolations}
        initialLayerId={openedLayerId}
        loadModuleSource={loadModuleSource}
        onBack={() => setOpenedLayerId(undefined)}
      />
    );
  }

  const selectedGraph = model.layerGraphs.find(
    ({ id }) => id === activeGraphId,
  );
  const visibleRules = selectedGraph?.rules ?? model.rules;
  const visibleLayers =
    selectedGraph === undefined
      ? model.layers
      : layersReferencedByRules(model.layers, visibleRules);
  const visibleLayerIds = new Set(visibleLayers.map(({ id }) => id));
  const visibleViolationPairs = model.layerViolationPairs.filter(
    ({ fromLayerId, toLayerId }) =>
      visibleLayerIds.has(fromLayerId) && visibleLayerIds.has(toLayerId),
  );
  const visibleCoverageViolations =
    selectedGraph === undefined ? model.layerCoverageViolations : [];
  const activeViolationPair = visibleViolationPairs.find(
    ({ id }) => id === activeViolationId,
  );
  const focus = resolveLayerFocus({
    activeLayerId,
    hoveredLayerId,
    blocked: activeViolationPair !== undefined,
  });
  const clearFocus = () => {
    setHoveredLayerId(undefined);
    setActiveLayerId(undefined);
    setActiveViolationId(undefined);
  };

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm',
        className,
      )}
    >
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight">
            Project Layers
          </h1>
          <p className="text-xs text-muted-foreground">
            Trace Rules, inspect Layer scopes, and review violations.
          </p>
        </div>
        <select
          aria-label="LayerGraph"
          className="h-9 min-w-48 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          value={activeGraphId}
          onChange={(event) => {
            clearFocus();
            setActiveGraphId(event.target.value);
          }}
        >
          <option value={allGraphsId}>All LayerGraphs</option>
          {model.layerGraphs.map(({ id }) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </header>

      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-[760px] flex-1"
      >
        <ResizablePanel defaultSize="75%" minSize="50%">
          <section className="flex size-full min-h-0 min-w-0 flex-col">
            <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border px-4">
              <p className="truncate text-xs text-muted-foreground">
                {selectedGraph?.description ?? 'All direct Rules'}
              </p>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                Pan · zoom · select · right-click to open
              </span>
            </div>
            <LayerGraph
              className="min-h-[515px] flex-1 rounded-none border-0"
              layers={model.layers}
              rules={visibleRules}
              layerGraphs={model.layerGraphs}
              activeLayerGraphId={selectedGraph?.id}
              activeLayerId={activeLayerId}
              hoveredLayerId={hoveredLayerId}
              activeViolationPair={activeViolationPair}
              onLayerHoverChange={(id) => {
                if (focus.hoverEnabled) setHoveredLayerId(id);
              }}
              onLayerActivate={(id) => {
                setHoveredLayerId(undefined);
                setActiveViolationId(undefined);
                setActiveLayerId(id);
              }}
              onLayerOpen={(id) => {
                clearFocus();
                setOpenedLayerId(id);
              }}
              onClearFocus={clearFocus}
            />
          </section>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="25%" minSize="20%" maxSize="50%">
          <aside className="size-full min-w-0">
            <ResizablePanelGroup orientation="vertical" className="min-h-0">
              <ResizablePanel defaultSize="60%" minSize="20%">
                <section
                  className={cn(
                    'size-full overflow-y-auto p-4',
                    scrollbarStyles,
                  )}
                >
                  <ArchitectureTreeLegend
                    title="Scopes"
                    boundaryLabel="Layer"
                  />
                  <LayerScopeTree
                    layers={visibleLayers}
                    activeLayerId={
                      activeViolationPair === undefined
                        ? activeLayerId
                        : undefined
                    }
                    onLayerActivate={setActiveLayerId}
                  />
                </section>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize="40%" minSize="20%">
                <section
                  className={cn(
                    'size-full overflow-y-auto p-4',
                    scrollbarStyles,
                  )}
                >
                  <SectionLabel>Violations</SectionLabel>
                  <LayerViolationsList
                    violationPairs={visibleViolationPairs}
                    coverageViolations={visibleCoverageViolations}
                    activeViolationGroupId={activeViolationId}
                    onActiveViolationGroupChange={(id) => {
                      setHoveredLayerId(undefined);
                      setActiveLayerId(undefined);
                      setActiveViolationId(id);
                    }}
                  />
                </section>
              </ResizablePanel>
            </ResizablePanelGroup>
          </aside>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export function ModulesExperience({
  layers,
  rules,
  layerGraphs,
  modules,
  dependencies,
  violations,
  initialLayerId,
  loadModuleSource,
  onBack,
  className,
}: {
  readonly layers: readonly Layer[];
  readonly rules: readonly LayerRule[];
  readonly layerGraphs?: readonly NamedLayerGraph[];
  readonly modules: readonly Module[];
  readonly dependencies: readonly ModuleDependency[];
  readonly violations: readonly ModuleViolation[];
  readonly initialLayerId: string;
  readonly loadModuleSource: LoadModuleSource;
  readonly onBack?: () => void;
  readonly className?: string;
}) {
  const [activeLayerId, setActiveLayerId] = useState<string | undefined>(
    initialLayerId,
  );
  const [showLayerConnections, setShowLayerConnections] = useState(true);
  const [activeModuleId, setActiveModuleId] = useState<string>();
  const [activeViolationId, setActiveViolationId] = useState<string>();
  const [sourceRequest, setSourceRequest] = useState<ModuleSourceOpenRequest>();
  const activeViolation = violations.find(({ id }) => id === activeViolationId);
  const focus = resolveModuleFocus({
    modules,
    dependencies,
    focusedLayerId: activeLayerId,
    activeModuleId,
    activeViolation,
  });

  useEffect(() => {
    const layerIds = new Set(layers.map(({ id }) => id));
    const moduleIds = new Set(
      modules.flatMap(({ id, nested }) => [
        id,
        ...nested.map(({ id: nestedId }) => nestedId),
      ]),
    );
    const violationIds = new Set(violations.map(({ id }) => id));
    if (activeLayerId !== undefined && !layerIds.has(activeLayerId)) {
      setActiveLayerId(undefined);
    }
    if (activeModuleId !== undefined && !moduleIds.has(activeModuleId)) {
      setActiveModuleId(undefined);
    }
    if (
      activeViolationId !== undefined &&
      !violationIds.has(activeViolationId)
    ) {
      setActiveViolationId(undefined);
    }
  }, [
    activeLayerId,
    activeModuleId,
    activeViolationId,
    layers,
    modules,
    violations,
  ]);

  const clearFocus = () => {
    setActiveLayerId(undefined);
    setActiveModuleId(undefined);
    setActiveViolationId(undefined);
  };

  const openModuleSource = (moduleId: string) => {
    const request = moduleSourceRequest(modules, moduleId);
    if (request !== undefined) setSourceRequest(request);
  };

  return (
    <>
      <div
        className={cn(
          'flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm',
          className,
        )}
      >
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {onBack !== undefined && (
              <button
                type="button"
                aria-label="Back to Layers"
                className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={onBack}
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight">
                All Modules
              </h1>
              <p className="text-xs text-muted-foreground">
                Select a Configured Module to reveal connections. Right-click to
                explore its source.
              </p>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
            Show Layer connections
            <Switch
              size="sm"
              checked={showLayerConnections}
              onCheckedChange={setShowLayerConnections}
            />
          </label>
        </header>

        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-[760px] flex-1"
        >
          <ResizablePanel defaultSize="75%" minSize="50%">
            <section className="flex size-full min-h-0 min-w-0 flex-col">
              <div className="flex min-h-11 items-center justify-end border-b border-border px-4">
                <ModuleLegend />
              </div>
              <ModuleGraph
                className="min-h-[515px] flex-1 rounded-none border-0"
                layers={layers}
                rules={rules}
                layerGraphs={layerGraphs}
                modules={modules}
                dependencies={dependencies}
                focusedLayerId={activeLayerId}
                showLayerConnections={showLayerConnections}
                activeModuleId={activeModuleId}
                activeViolation={activeViolation}
                onModuleActivate={(id) => {
                  setActiveLayerId(undefined);
                  setActiveViolationId(undefined);
                  setActiveModuleId(id);
                }}
                onModuleOpen={openModuleSource}
                onLayerActivate={(id) => {
                  setActiveModuleId(undefined);
                  setActiveViolationId(undefined);
                  setActiveLayerId(id);
                }}
                onClearFocus={clearFocus}
              />
            </section>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="25%" minSize="20%" maxSize="50%">
            <aside className="size-full min-w-0">
              <ResizablePanelGroup orientation="vertical">
                <ResizablePanel defaultSize="60%" minSize="20%">
                  <section
                    className={cn(
                      'size-full overflow-y-auto p-4',
                      scrollbarStyles,
                    )}
                  >
                    <ArchitectureTreeLegend
                      title="Modules"
                      boundaryLabel="Module"
                    />
                    <ModuleTree
                      modules={modules}
                      layerIdsByPath={layerIdsByBoundaryPath(layers)}
                      activeLayerId={activeLayerId}
                      activeModuleId={activeModuleId}
                      highlightedModuleIds={focus.highlightedModuleIds}
                      activeViolation={activeViolation}
                      onModuleActivate={(id) => {
                        setActiveLayerId(undefined);
                        setActiveViolationId(undefined);
                        setActiveModuleId(id);
                      }}
                      onModuleOpen={openModuleSource}
                      onLayerActivate={(id) => {
                        setActiveModuleId(undefined);
                        setActiveViolationId(undefined);
                        setActiveLayerId(id);
                      }}
                    />
                  </section>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize="40%" minSize="20%">
                  <section
                    className={cn(
                      'size-full overflow-y-auto p-4',
                      scrollbarStyles,
                    )}
                  >
                    <SectionLabel>Module violations</SectionLabel>
                    <ModuleViolationsList
                      violations={violations}
                      activeViolationId={activeViolationId}
                      onActiveViolationChange={(id) => {
                        setActiveLayerId(undefined);
                        setActiveModuleId(undefined);
                        setActiveViolationId(id);
                      }}
                    />
                  </section>
                </ResizablePanel>
              </ResizablePanelGroup>
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      {sourceRequest !== undefined && (
        <ModuleSourceExplorer
          key={`${sourceRequest.modulePath}:${sourceRequest.initialFilePath ?? ''}`}
          request={sourceRequest}
          loadModuleSource={loadModuleSource}
          onClose={() => setSourceRequest(undefined)}
        />
      )}
    </>
  );
}

function SectionLabel({ children }: { readonly children: ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}
