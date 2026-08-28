import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type {
  ArchitectureAnalysis,
  Branch,
  ChangeSet,
  StoryTree,
} from 'laymos';

import {
  ChevronDown,
  GitBranch,
  Network,
  SlidersHorizontal,
} from '@monorepo/frontend/lib/lucide';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@monorepo/frontend/components/ui/dropdown-menu';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@monorepo/frontend/components/ui/resizable';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@monorepo/frontend/components/ui/tabs';
import { scrollbarStyles } from '@monorepo/frontend/lib/scrollStyles';
import { cn } from '@monorepo/frontend/lib/utils';

import {
  buildPresentationModel,
  layersReferencedByRules,
  type Layer,
  type LayerCoverageViolation,
  type LayerRule,
  type LayerViolationPair,
  type NamedLayerGraph,
  type Module,
  type ModuleDependency,
  type ModuleGraph as ModuleGraphModel,
  type ModuleViolation,
} from '../analysis-presentation';
import { graphGroups } from '../architecture-graph';
import {
  ArchitectureTreeLegend,
  layerIdsByBoundaryPath,
} from '../architecture-tree';
import {
  coverageGroupId,
  LayerGraph,
  LayerScopeTree,
  LayerViolationsList,
  resolveLayerFocus,
} from '../layer-inspection';
import {
  ModuleGraph,
  ModuleLegend,
  ModuleTree,
  ModuleViolationsList,
  resolveModuleFocus,
} from '../module-inspection';
import {
  ModuleSourceExplorer,
  moduleSourceRequest,
  type LoadDocumentation,
  type LoadFileDiff,
  type LoadSourceFiles,
  type SourceOpenRequest,
} from '../module-source';
import { changedPathsUnder, type ChangeIndex } from '../project-changes';
import { StoriesDocsSite, type StoryReports } from '../story-inspection';

export interface GitOptions {
  // Off hides the change overlay entirely, whatever git reports.
  readonly showChanges: boolean;
  readonly includeUnchanged: boolean;
}

export const defaultGitOptions: GitOptions = {
  showChanges: true,
  includeUnchanged: false,
};

// The Base ref 'HEAD' means the working tree's uncommitted changes; any other
// value is a branch name, whose Change set already carries uncommitted work
// on top, since a Base ref diffs against the working tree, never a commit.
export const uncommittedBaseRef = 'HEAD';

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
  readonly moduleGraphs?: readonly ModuleGraphModel[];
  readonly dependencies: readonly ModuleDependency[];
  readonly moduleViolations?: readonly ModuleViolation[];
  readonly loadSourceFiles: LoadSourceFiles;
  readonly loadFileDiff?: LoadFileDiff;
  readonly loadDocumentation?: LoadDocumentation;
  readonly changes?: ChangeIndex;
  readonly gitOptions?: GitOptions;
  readonly onGitOptionsChange?: (options: GitOptions) => void;
  readonly gitAvailable?: boolean;
  readonly branches?: readonly Branch[];
  readonly baseRef?: string;
  readonly onBaseRefChange?: (baseRef: string) => void;
  readonly stories?: StoriesTabProps;
  readonly toolbarContainer?: HTMLElement | null;
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
  loadSourceFiles,
  loadFileDiff,
  loadDocumentation,
  changes,
  branches,
  baseRef = uncommittedBaseRef,
  onBaseRefChange,
  // Whether git integration exists for this Project at all, independent of
  // whether a Change set has been fetched yet — a caller that lets the user
  // pick a Base ref before any Change set exists (e.g. defaulting to no
  // diff) must pass this explicitly, or the picker never gets a chance to
  // open. Defaults to inferring availability from what was actually passed.
  gitAvailable = changes !== undefined ||
    branches !== undefined ||
    onBaseRefChange !== undefined,
  stories,
  className,
}: {
  readonly analysis: ArchitectureAnalysis;
  readonly loadSourceFiles: LoadSourceFiles;
  readonly loadFileDiff?: LoadFileDiff;
  readonly loadDocumentation?: LoadDocumentation;
  readonly changes?: ChangeSet;
  readonly branches?: readonly Branch[];
  readonly baseRef?: string;
  readonly onBaseRefChange?: (baseRef: string) => void;
  readonly gitAvailable?: boolean;
  readonly stories?: StoriesTabProps;
  readonly className?: string;
}) {
  const [gitOptions, setGitOptions] = useState<GitOptions>(defaultGitOptions);
  const visibleChanges = useMemo(() => {
    if (changes === undefined || !gitOptions.showChanges) return undefined;
    return changes;
  }, [changes, gitOptions.showChanges]);
  const model = useMemo(
    () => buildPresentationModel(analysis, visibleChanges),
    [analysis, visibleChanges],
  );

  return (
    <LaymosShell
      changes={model.changes}
      gitOptions={gitOptions}
      onGitOptionsChange={setGitOptions}
      gitAvailable={gitAvailable}
      branches={branches}
      baseRef={baseRef}
      onBaseRefChange={onBaseRefChange}
      loadFileDiff={loadFileDiff}
      loadDocumentation={loadDocumentation}
      layers={model.layers}
      rules={model.rules}
      layerGraphs={model.layerGraphs}
      layerViolationPairs={model.layerViolationPairs}
      layerCoverageViolations={model.layerCoverageViolations}
      modules={model.modules}
      moduleGraphs={model.moduleGraphs}
      dependencies={model.moduleDependencies}
      moduleViolations={model.moduleViolations}
      loadSourceFiles={loadSourceFiles}
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
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null);
  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className={cn(
        'flex min-h-0 flex-col gap-0 overflow-hidden rounded-xl border border-border bg-background shadow-sm',
        className,
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border px-4 sm:px-5">
        <TabsList variant="line" className="h-12">
          <TabsTrigger value={layersModulesTabId}>
            {'Layers <> Modules'}
          </TabsTrigger>
          {stories !== undefined && (
            <TabsTrigger value={storiesTabId}>Stories</TabsTrigger>
          )}
        </TabsList>
        <div ref={setToolbar} className="flex items-center gap-2" />
      </div>
      <TabsContent
        value={layersModulesTabId}
        className="flex min-h-0 flex-1 flex-col"
      >
        <LayersModulesExperience
          {...view}
          toolbarContainer={activeTab === layersModulesTabId ? toolbar : null}
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
  moduleGraphs = [],
  dependencies,
  moduleViolations = [],
  gitOptions = defaultGitOptions,
  onGitOptionsChange,
  gitAvailable = false,
  branches = [],
  baseRef = uncommittedBaseRef,
  onBaseRefChange,
  loadSourceFiles,
  loadFileDiff,
  loadDocumentation,
  changes,
  toolbarContainer,
  className,
}: LayersModulesProps) {
  const [activeGraphId, setActiveGraphId] = useState(allGraphsId);
  const [showModules, setShowModules] = useState(true);
  // A change set touching no analyzed file would otherwise empty the whole view.
  const hasChangedModules = allModules.some(
    ({ changeStatus }) => changeStatus !== undefined,
  );
  const changesOnly =
    changes !== undefined && !gitOptions.includeUnchanged && hasChangedModules;
  const modules = changesOnly
    ? allModules.filter(({ changeStatus }) => changeStatus !== undefined)
    : allModules;
  const changedLayerIds = new Set(modules.map(({ layerId }) => layerId));
  const visibleModuleGraphs = moduleGraphs.filter(({ memberIds }) =>
    memberIds.some((id) => modules.some((module) => module.id === id)),
  );
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
  const [showModuleConnections, setShowModuleConnections] = useState(true);
  const [isolateGraph, setIsolateGraph] = useState(false);
  const [activeLayerId, setActiveLayerId] = useState<string>();
  const [hoveredLayerId, setHoveredLayerId] = useState<string>();
  const [activeModuleId, setActiveModuleId] = useState<string>();
  const [activeViolationId, setActiveViolationId] = useState<string>();
  const [sourceRequest, setSourceRequest] = useState<SourceOpenRequest>();

  // A LayerGraph every one of whose Layers is hosted elsewhere draws no lane,
  // so offering it would be a selection with nothing to show.
  const graphGroupList = graphGroups({ layers, rules, layerGraphs });
  const drawnGraphIds = graphGroupList.map(({ id }) => id);
  const selectedGraph = layerGraphs.find(
    ({ id }) => id === activeGraphId && drawnGraphIds.includes(id),
  );
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
  const layerIdByModuleId = new Map<string, string>(
    modules.map((module) => [module.id, module.layerId] as const),
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
    const moduleIds = new Set(modules.map(({ id }) => id));
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
  // Isolation only means anything against a selected LayerGraph, so the toggle
  // stays flipped but has no effect while every LayerGraph is shown.
  const isolatedLayerGraphId =
    isolateGraph && selectedGraph !== undefined ? selectedGraph.id : undefined;
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
  const openModuleGraphSource = (graphId: string) => {
    const graph = moduleGraphs.find(({ id }) => id === graphId);
    if (graph !== undefined) {
      setSourceRequest({
        title: graph.path,
        pathPrefixes: [graph.path],
        scope: {
          kind: 'module-graph',
          layerId: graph.layerId,
          graphId: graph.id,
        },
      });
    }
  };
  const openLayerSource = (layerId: string) => {
    const layer = allLayers.find(({ id }) => id === layerId);
    if (layer !== undefined) {
      setSourceRequest({
        title: layer.id,
        pathPrefixes: layer.scopes.map(({ path }) => path),
        scope: { kind: 'layer', layerId: layer.id },
      });
    }
  };
  const openLayerGraphSource = (graphId: string) => {
    const group = graphGroupList.find(({ id }) => id === graphId);
    if (group === undefined) return;
    const hostedLayerIds = new Set(group.layerIds);
    const pathPrefixes = allLayers
      .filter(({ id }) => hostedLayerIds.has(id))
      .flatMap(({ scopes }) => scopes.map(({ path }) => path));
    if (pathPrefixes.length > 0) {
      setSourceRequest({
        title: graphId,
        pathPrefixes,
        scope: { kind: 'layer-graph', graphId },
      });
    }
  };

  const toolbar = (
    <>
      <ViewOptionsMenu
        options={{
          showModules,
          showLayerConnections,
          showModuleConnections,
          isolateGraph,
        }}
        isolatingGraph={isolatedLayerGraphId !== undefined}
        onChange={(next) => {
          if (next.showModules !== showModules) {
            toggleShowModules(next.showModules);
          }
          setShowLayerConnections(next.showLayerConnections);
          setShowModuleConnections(next.showModuleConnections);
          if (next.isolateGraph !== isolateGraph) {
            clearFocus();
            setIsolateGraph(next.isolateGraph);
          }
        }}
      />
      {gitAvailable && onGitOptionsChange !== undefined && (
        <GitOptionsMenu
          options={gitOptions}
          baseRef={baseRef}
          branches={branches}
          hasChangedModules={hasChangedModules}
          onOptionsChange={(next) => {
            clearFocus();
            onGitOptionsChange(next);
          }}
          onBaseRefChange={
            onBaseRefChange === undefined
              ? undefined
              : (next) => {
                  clearFocus();
                  onBaseRefChange(next);
                }
          }
        />
      )}
      <LayerGraphMenu
        graphIds={drawnGraphIds}
        value={activeGraphId}
        onChange={(graphId) => {
          clearFocus();
          setActiveGraphId(graphId);
        }}
      />
    </>
  );

  return (
    <>
      <div
        className={cn(
          'flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm',
          className,
        )}
      >
        {toolbarContainer ? (
          createPortal(toolbar, toolbarContainer)
        ) : (
          <header className="flex h-12 shrink-0 items-center justify-end gap-2 border-b border-border px-4 sm:px-5">
            {toolbar}
          </header>
        )}

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
                  isolatedLayerGraphId={isolatedLayerGraphId}
                  modules={modules}
                  moduleGraphs={visibleModuleGraphs}
                  dependencies={dependencies}
                  focusedLayerId={activeLayerId}
                  showLayerConnections={showLayerConnections}
                  showModuleConnections={showModuleConnections}
                  activeModuleId={activeModuleId}
                  activeViolation={activeViolation}
                  onModuleActivate={activateModule}
                  onModuleOpen={openModuleSource}
                  onModuleGraphOpen={openModuleGraphSource}
                  onLayerActivate={activateLayer}
                  onLayerOpen={openLayerSource}
                  onLayerGraphActivate={activateLayerGraph}
                  onLayerGraphOpen={openLayerGraphSource}
                  onClearFocus={clearFocus}
                />
              ) : (
                <LayerGraph
                  className="min-h-[515px] flex-1 rounded-none border-0"
                  layers={layers}
                  rules={visibleRules}
                  layerGraphs={layerGraphs}
                  activeLayerGraphId={selectedGraph?.id}
                  isolatedLayerGraphId={isolatedLayerGraphId}
                  showLayerConnections={showLayerConnections}
                  activeLayerId={activeLayerId}
                  hoveredLayerId={hoveredLayerId}
                  activeViolationPair={activeViolationPair}
                  onLayerHoverChange={(id) => {
                    if (layerFocus.hoverEnabled) setHoveredLayerId(id);
                  }}
                  onLayerActivate={activateLayer}
                  onLayerOpen={openLayerSource}
                  onLayerGraphActivate={activateLayerGraph}
                  onLayerGraphOpen={openLayerGraphSource}
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
          key={`${sourceRequest.pathPrefixes.join('\0')}:${sourceRequest.initialFilePath ?? ''}`}
          request={sourceRequest}
          loadSourceFiles={loadSourceFiles}
          loadFileDiff={loadFileDiff}
          loadDocumentation={loadDocumentation}
          changedPaths={
            changes === undefined
              ? undefined
              : changedPathsUnder(changes, sourceRequest.pathPrefixes)
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
    case 'dead-module':
      return [layerIdByModuleId.get(violation.moduleId)];
    case 'coverage':
    case 'graph-coverage':
      return [violation.layerId];
  }
}

interface ViewOptions {
  readonly showModules: boolean;
  readonly showLayerConnections: boolean;
  readonly showModuleConnections: boolean;
  readonly isolateGraph: boolean;
}

function viewSummary(options: ViewOptions, isolating: boolean): string {
  if (isolating) return 'Isolated LayerGraph';
  if (!options.showModules) {
    return options.showLayerConnections ? 'Layers only' : 'Layers, no lines';
  }
  const hidden = [
    options.showLayerConnections ? undefined : 'Layer',
    options.showModuleConnections ? undefined : 'Module',
  ].filter((label) => label !== undefined);
  if (hidden.length === 2) return 'Connections on select';
  return hidden.length === 1
    ? `No ${hidden[0]} connections`
    : 'Everything shown';
}

function ViewOptionsMenu({
  options,
  isolatingGraph,
  onChange,
}: {
  readonly options: ViewOptions;
  readonly isolatingGraph: boolean;
  readonly onChange: (options: ViewOptions) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-8 max-w-56 items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 text-sm text-foreground outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40">
        <span className="flex min-w-0 items-center gap-2">
          <SlidersHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {viewSummary(options, isolatingGraph)}
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Detail</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={options.showModules}
            onCheckedChange={(showModules) =>
              onChange({ ...options, showModules })
            }
          >
            Show Modules
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Connections</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={options.showLayerConnections}
            onCheckedChange={(showLayerConnections) =>
              onChange({ ...options, showLayerConnections })
            }
          >
            Show Layer connections
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={options.showModuleConnections}
            disabled={!options.showModules}
            onCheckedChange={(showModuleConnections) =>
              onChange({ ...options, showModuleConnections })
            }
          >
            Show Module connections
          </DropdownMenuCheckboxItem>
          <MenuNote>
            Hidden connections still appear for whatever you select.
          </MenuNote>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Isolate</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={options.isolateGraph}
            onCheckedChange={(isolateGraph) =>
              onChange({ ...options, isolateGraph })
            }
          >
            Isolate LayerGraph
          </DropdownMenuCheckboxItem>
          <MenuNote>
            Hides every LayerGraph the selection does not depend on, and waits
            until you select one.
          </MenuNote>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuNote({ children }: { readonly children: ReactNode }) {
  return (
    <p className="px-2 pb-1.5 pt-1 text-[11px] leading-snug text-muted-foreground">
      {children}
    </p>
  );
}

function LayerGraphMenu({
  graphIds,
  value,
  onChange,
}: {
  readonly graphIds: readonly string[];
  readonly value: string;
  readonly onChange: (graphId: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-8 max-w-56 items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 text-sm text-foreground outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40">
        <span className="flex min-w-0 items-center gap-2">
          <Network className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {value === allGraphsId ? 'All LayerGraphs' : value}
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuLabel>LayerGraph</DropdownMenuLabel>
          <DropdownMenuRadioItem value={allGraphsId}>
            All LayerGraphs
          </DropdownMenuRadioItem>
          {graphIds.map((graphId) => (
            <DropdownMenuRadioItem key={graphId} value={graphId}>
              {graphId}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GitOptionsMenu({
  options,
  baseRef,
  branches,
  hasChangedModules,
  onOptionsChange,
  onBaseRefChange,
}: {
  readonly options: GitOptions;
  readonly baseRef: string;
  readonly branches: readonly Branch[];
  readonly hasChangedModules: boolean;
  readonly onOptionsChange: (options: GitOptions) => void;
  readonly onBaseRefChange?: (baseRef: string) => void;
}) {
  const comparing =
    baseRef === uncommittedBaseRef ? 'Uncommitted changes' : baseRef;
  const summary = !options.showChanges
    ? 'Git changes off'
    : hasChangedModules
      ? comparing
      : `No changes · ${comparing}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-8 max-w-56 items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 text-sm text-foreground outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40">
        <span className="flex min-w-0 items-center gap-2">
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{summary}</span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Git changes</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={options.showChanges}
            onCheckedChange={(showChanges) =>
              onOptionsChange({ ...options, showChanges })
            }
          >
            Show git changes
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        {options.showChanges && onBaseRefChange !== undefined && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Compare against</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={baseRef}
                onValueChange={onBaseRefChange}
              >
                <DropdownMenuRadioItem value={uncommittedBaseRef}>
                  Uncommitted changes
                </DropdownMenuRadioItem>
                {branches.map((branch) => (
                  <DropdownMenuRadioItem key={branch.name} value={branch.name}>
                    {branch.name}
                    {branch.current ? ' (current)' : ''}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Scope</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={options.includeUnchanged}
            disabled={!options.showChanges}
            onCheckedChange={(includeUnchanged) =>
              onOptionsChange({ ...options, includeUnchanged })
            }
          >
            Include unchanged
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SectionLabel({ children }: { readonly children: ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}
