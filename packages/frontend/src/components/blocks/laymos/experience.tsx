import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ArchitectureAnalysis, ChangeSet, StoryTree } from 'laymos';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#components/ui/resizable';
import { Switch } from '#components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import { resolveLayerFocus } from './layers/focus';
import { LayerGraph } from './layers/graph';
import {
  layersReferencedByRules,
  type NamedLayerGraph,
} from './layers/layer-graphs';
import type {
  Layer,
  LayerCoverageViolation,
  LayerRule,
  LayerViolationPair,
} from './layers/model';
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
  type LoadFileDiff,
  type LoadModuleSource,
  type ModuleSourceOpenRequest,
} from './module-source-explorer';
import { changedPathsUnder, type ChangeIndex } from './changes';
import { buildPresentationModel } from './presentation-model';
import { StoriesDocsSite, type StoryReports } from './stories/index';
import { ArchitectureTreeLegend } from './tree';
import { layerIdsByBoundaryPath } from './tree/presentation';

type ChangeScope = 'changed' | 'all';

const allGraphsId = 'all';
const layersModulesTabId = 'layers-modules';
const storiesTabId = 'stories';

interface LayersModulesProps {
  readonly layers: readonly Layer[];
  readonly rules: readonly LayerRule[];
  readonly layerGraphs?: readonly NamedLayerGraph[];
  readonly layerViolationPairs?: readonly LayerViolationPair[];
  readonly layerCoverageViolations?: readonly LayerCoverageViolation[];
  readonly modules: readonly Module[];
  readonly dependencies: readonly ModuleDependency[];
  readonly moduleViolations?: readonly ModuleViolation[];
  readonly loadModuleSource: LoadModuleSource;
  readonly loadFileDiff?: LoadFileDiff;
  readonly changes?: ChangeIndex;
  readonly stories?: StoriesTabProps;
  readonly className?: string;
}

interface StoriesTabProps {
  readonly tree: StoryTree;
  readonly reports?: StoryReports;
  readonly running?: boolean;
  readonly onRun?: (scope?: string) => void;
}

export function LaymosExperience({
  analysis,
  loadModuleSource,
  loadFileDiff,
  changes,
  stories,
  className,
}: {
  readonly analysis: ArchitectureAnalysis;
  readonly loadModuleSource: LoadModuleSource;
  readonly loadFileDiff?: LoadFileDiff;
  readonly changes?: ChangeSet;
  readonly stories?: StoriesTabProps;
  readonly className?: string;
}) {
  const model = useMemo(
    () => buildPresentationModel(analysis, changes),
    [analysis, changes],
  );

  return (
    <LaymosShell
      changes={model.changes}
      loadFileDiff={loadFileDiff}
      layers={model.layers}
      rules={model.rules}
      layerGraphs={model.layerGraphs}
      layerViolationPairs={model.layerViolationPairs}
      layerCoverageViolations={model.layerCoverageViolations}
      modules={model.modules}
      dependencies={model.moduleDependencies}
      moduleViolations={model.moduleViolations}
      loadModuleSource={loadModuleSource}
      stories={stories}
      className={className}
    />
  );
}

export function LaymosShell({
  className,
  stories,
  ...view
}: LayersModulesProps) {
  const { changes } = view;
  const [activeTab, setActiveTab] = useState(layersModulesTabId);
  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className={cn(
        'flex min-h-0 flex-col gap-0 overflow-hidden rounded-xl border border-border bg-background shadow-sm',
        className,
      )}
    >
      <div className="border-b border-border px-4 pb-2.5 pt-2 sm:px-5">
        <TabsList variant="line">
          <TabsTrigger value={layersModulesTabId}>
            {'Layers <> Modules'}
          </TabsTrigger>
          {stories !== undefined && (
            <TabsTrigger value={storiesTabId}>Stories</TabsTrigger>
          )}
        </TabsList>
      </div>
      <TabsContent
        value={layersModulesTabId}
        className="flex min-h-0 flex-1 flex-col"
      >
        <LayersModulesExperience
          {...view}
          className="flex-1 rounded-none border-0 shadow-none"
        />
      </TabsContent>
      {stories !== undefined && (
        <TabsContent
          value={storiesTabId}
          className="flex min-h-0 flex-1 flex-col"
        >
          <StoriesDocsSite
            {...stories}
            changedPaths={changes?.files}
            className="min-h-0 flex-1"
          />
        </TabsContent>
      )}
    </Tabs>
  );
}

export function LayersModulesExperience({
  layers: allLayers,
  rules,
  layerGraphs: allLayerGraphs = [],
  layerViolationPairs = [],
  layerCoverageViolations = [],
  modules: allModules,
  dependencies,
  moduleViolations = [],
  loadModuleSource,
  loadFileDiff,
  changes,
  className,
}: LayersModulesProps) {
  const [activeGraphId, setActiveGraphId] = useState(allGraphsId);
  const [showModules, setShowModules] = useState(true);
  const [changeScope, setChangeScope] = useState<ChangeScope>('changed');
  const changesOnly = changes !== undefined && changeScope === 'changed';
  const modules = changesOnly
    ? allModules.filter(({ changeStatus }) => changeStatus !== undefined)
    : allModules;
  const changedLayerIds = new Set(modules.map(({ layerId }) => layerId));
  const layers = changesOnly
    ? allLayers.filter(
        ({ id, changeStatus }) =>
          changedLayerIds.has(id) || changeStatus !== undefined,
      )
    : allLayers;
  const visibleLayerIdSet = new Set(layers.map(({ id }) => id));
  // A LayerGraph whose Layers are all unchanged has nothing to show.
  const layerGraphs = changesOnly
    ? allLayerGraphs.filter(({ rules: graphRules }) =>
        graphRules.some(
          ({ fromLayerId, toLayerIds }) =>
            visibleLayerIdSet.has(fromLayerId) ||
            toLayerIds.some((id) => visibleLayerIdSet.has(id)),
        ),
      )
    : allLayerGraphs;
  const [showLayerConnections, setShowLayerConnections] = useState(true);
  const [activeLayerId, setActiveLayerId] = useState<string>();
  const [hoveredLayerId, setHoveredLayerId] = useState<string>();
  const [activeModuleId, setActiveModuleId] = useState<string>();
  const [activeViolationId, setActiveViolationId] = useState<string>();
  const [sourceRequest, setSourceRequest] = useState<ModuleSourceOpenRequest>();

  const selectedGraph = layerGraphs.find(({ id }) => id === activeGraphId);
  const visibleRules = selectedGraph?.rules ?? rules;
  const visibleLayers =
    selectedGraph === undefined
      ? layers
      : layersReferencedByRules(layers, visibleRules);
  const visibleLayerIds = new Set(visibleLayers.map(({ id }) => id));
  const visibleViolationPairs = layerViolationPairs.filter(
    ({ fromLayerId, toLayerId }) =>
      visibleLayerIds.has(fromLayerId) && visibleLayerIds.has(toLayerId),
  );
  const visibleCoverageViolations =
    selectedGraph === undefined ? layerCoverageViolations : [];
  const visibleModules =
    selectedGraph === undefined
      ? modules
      : modules.filter(({ layerId }) => visibleLayerIds.has(layerId));
  const layerIdByModuleId = new Map(
    modules.flatMap((module) => [
      [module.id, module.layerId] as const,
      ...module.nested.map(({ id }) => [id, module.layerId] as const),
    ]),
  );
  const visibleModuleViolations =
    selectedGraph === undefined
      ? moduleViolations
      : moduleViolations.filter((violation) =>
          violationLayerIds(violation, layerIdByModuleId).every(
            (layerId) => layerId !== undefined && visibleLayerIds.has(layerId),
          ),
        );

  const activeViolation = showModules
    ? visibleModuleViolations.find(({ id }) => id === activeViolationId)
    : undefined;
  const activeViolationPair = showModules
    ? undefined
    : visibleViolationPairs.find(({ id }) => id === activeViolationId);
  const moduleFocus = resolveModuleFocus({
    modules,
    dependencies,
    focusedLayerId: activeLayerId,
    activeModuleId,
    activeViolation,
  });
  const layerFocus = resolveLayerFocus({
    activeLayerId,
    hoveredLayerId,
    blocked: activeViolationPair !== undefined,
  });

  useEffect(() => {
    const layerIds = new Set(layers.map(({ id }) => id));
    const graphIds = new Set(layerGraphs.map(({ id }) => id));
    const moduleIds = new Set(
      modules.flatMap(({ id, nested }) => [
        id,
        ...nested.map(({ id: nestedId }) => nestedId),
      ]),
    );
    const violationIds = new Set([
      ...moduleViolations.map(({ id }) => id),
      ...layerViolationPairs.map(({ id }) => id),
    ]);
    if (layerCoverageViolations.length > 0) {
      violationIds.add(coverageGroupId);
    }
    if (activeLayerId !== undefined && !layerIds.has(activeLayerId)) {
      setActiveLayerId(undefined);
    }
    if (activeGraphId !== allGraphsId && !graphIds.has(activeGraphId)) {
      setActiveGraphId(allGraphsId);
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
    activeGraphId,
    activeLayerId,
    activeModuleId,
    activeViolationId,
    layerCoverageViolations,
    layerGraphs,
    layerViolationPairs,
    layers,
    modules,
    moduleViolations,
  ]);

  const clearFocus = () => {
    setHoveredLayerId(undefined);
    setActiveLayerId(undefined);
    setActiveModuleId(undefined);
    setActiveViolationId(undefined);
  };
  const activateLayer = (layerId: string) => {
    setHoveredLayerId(undefined);
    setActiveModuleId(undefined);
    setActiveViolationId(undefined);
    setActiveLayerId(layerId);
  };
  const activateModule = (moduleId: string) => {
    setHoveredLayerId(undefined);
    setActiveLayerId(undefined);
    setActiveViolationId(undefined);
    setActiveModuleId(moduleId);
  };
  const activateViolation = (violationId: string | undefined) => {
    setHoveredLayerId(undefined);
    setActiveLayerId(undefined);
    setActiveModuleId(undefined);
    setActiveViolationId(violationId);
  };
  const activateLayerGraph = (graphId: string) => {
    clearFocus();
    setActiveGraphId(graphId === activeGraphId ? allGraphsId : graphId);
  };
  const toggleShowModules = (value: boolean) => {
    setShowModules(value);
    setHoveredLayerId(undefined);
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
          <p className="min-w-0 text-xs text-muted-foreground">
            Select a Layer or Module to reveal connections. Right-click a Module
            to explore its source.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
              Show Modules
              <Switch
                size="sm"
                checked={showModules}
                onCheckedChange={toggleShowModules}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
              Show Layer connections
              <Switch
                size="sm"
                checked={showLayerConnections}
                onCheckedChange={setShowLayerConnections}
              />
            </label>
            {changes !== undefined && (
              <select
                aria-label="Change scope"
                className="h-9 min-w-56 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                value={changeScope}
                onChange={(event) => {
                  clearFocus();
                  setChangeScope(event.target.value as ChangeScope);
                }}
              >
                <option value="changed">
                  {`Changes since ${changes.baseRef}`}
                </option>
                <option value="all">Include unchanged</option>
              </select>
            )}
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
              {layerGraphs.map(({ id }) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
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
                {showModules ? (
                  <ModuleLegend />
                ) : (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    Pan · zoom · select
                  </span>
                )}
              </div>
              {showModules ? (
                <ModuleGraph
                  className="min-h-[515px] flex-1 rounded-none border-0"
                  layers={layers}
                  rules={rules}
                  layerGraphs={layerGraphs}
                  activeLayerGraphId={selectedGraph?.id}
                  modules={modules}
                  dependencies={dependencies}
                  focusedLayerId={activeLayerId}
                  showLayerConnections={showLayerConnections}
                  activeModuleId={activeModuleId}
                  activeViolation={activeViolation}
                  onModuleActivate={activateModule}
                  onModuleOpen={openModuleSource}
                  onLayerActivate={activateLayer}
                  onLayerGraphActivate={activateLayerGraph}
                  onClearFocus={clearFocus}
                />
              ) : (
                <LayerGraph
                  className="min-h-[515px] flex-1 rounded-none border-0"
                  layers={layers}
                  rules={visibleRules}
                  layerGraphs={layerGraphs}
                  activeLayerGraphId={selectedGraph?.id}
                  showLayerConnections={showLayerConnections}
                  activeLayerId={activeLayerId}
                  hoveredLayerId={hoveredLayerId}
                  activeViolationPair={activeViolationPair}
                  onLayerHoverChange={(id) => {
                    if (layerFocus.hoverEnabled) setHoveredLayerId(id);
                  }}
                  onLayerActivate={activateLayer}
                  onLayerGraphActivate={activateLayerGraph}
                  onClearFocus={clearFocus}
                />
              )}
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
                    {showModules ? (
                      <>
                        <ArchitectureTreeLegend
                          title="Modules"
                          boundaryLabel="Module"
                        />
                        <ModuleTree
                          modules={visibleModules}
                          layerIdsByPath={layerIdsByBoundaryPath(visibleLayers)}
                          activeLayerId={activeLayerId}
                          activeModuleId={activeModuleId}
                          highlightedModuleIds={
                            moduleFocus.highlightedModuleIds
                          }
                          activeViolation={activeViolation}
                          onModuleActivate={activateModule}
                          onModuleOpen={openModuleSource}
                          onLayerActivate={activateLayer}
                        />
                      </>
                    ) : (
                      <>
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
                          onLayerActivate={activateLayer}
                        />
                      </>
                    )}
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
                    {showModules ? (
                      <>
                        <SectionLabel>Module violations</SectionLabel>
                        <ModuleViolationsList
                          violations={visibleModuleViolations}
                          activeViolationId={activeViolationId}
                          onActiveViolationChange={activateViolation}
                        />
                      </>
                    ) : (
                      <>
                        <SectionLabel>Violations</SectionLabel>
                        <LayerViolationsList
                          violationPairs={visibleViolationPairs}
                          coverageViolations={visibleCoverageViolations}
                          activeViolationGroupId={activeViolationId}
                          onActiveViolationGroupChange={activateViolation}
                        />
                      </>
                    )}
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
          loadFileDiff={loadFileDiff}
          changedPaths={
            changes === undefined
              ? undefined
              : changedPathsUnder(changes, sourceRequest.modulePath)
          }
          onClose={() => setSourceRequest(undefined)}
        />
      )}
    </>
  );
}

function violationLayerIds(
  violation: ModuleViolation,
  layerIdByModuleId: ReadonlyMap<string, string>,
): readonly (string | undefined)[] {
  switch (violation.kind) {
    case 'dependency':
    case 'boundary':
      return [
        layerIdByModuleId.get(violation.fromModuleId),
        layerIdByModuleId.get(violation.toModuleId),
      ];
    case 'cycle':
      return violation.moduleIds.map((moduleId) =>
        layerIdByModuleId.get(moduleId),
      );
    case 'missing-entry-point':
      return [layerIdByModuleId.get(violation.moduleId)];
    case 'unused-shared':
      return [layerIdByModuleId.get(violation.moduleId)];
    case 'coverage':
      return [violation.layerId];
  }
}

function SectionLabel({ children }: { readonly children: ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}
