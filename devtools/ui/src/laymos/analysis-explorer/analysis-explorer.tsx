import { useMemo } from 'react';
import type {
  ArchitectureAnalysis,
  Branch,
  ChangeSet,
  StoryReport,
  StoryTree,
} from 'laymos';

import { LaymosExperience } from '../architecture-workspace';
import {
  buildPresentationModel,
  layersReferencedByRules,
  type LayerInteraction,
} from '../analysis-presentation';
import { layerIdsByBoundaryPath } from '../architecture-tree';
import {
  LayerDetails as LayerDetailsView,
  LayerGraph as LayerGraphView,
  LayerScopeTree as LayerScopeTreeView,
  LayerViolationsList as LayerViolationsListView,
} from '../layer-inspection';
import {
  ModuleGraph as ModuleGraphView,
  ModuleLegend,
  ModuleTree as ModuleTreeView,
  ModuleViolationsList as ModuleViolationsListView,
} from '../module-inspection';
import type {
  LoadDocumentation,
  LoadFileDiff,
  LoadSourceFiles,
} from '../module-source';

interface AnalysisProps {
  readonly analysis: ArchitectureAnalysis;
  readonly className?: string;
}

interface LaymosProps extends AnalysisProps {
  readonly loadSourceFiles: LoadSourceFiles;
  readonly changes?: ChangeSet;
  readonly loadFileDiff?: LoadFileDiff;
  readonly loadDocumentation?: LoadDocumentation;
  readonly branches?: readonly Branch[];
  readonly baseRef?: string;
  readonly onBaseRefChange?: (baseRef: string) => void;
  readonly gitAvailable?: boolean;
  readonly stories?: {
    readonly tree: StoryTree;
    readonly reports?: Readonly<Record<string, StoryReport>>;
    readonly running?: boolean;
    readonly onRun?: (scope?: string) => void;
  };
}

interface LayerGraphProps extends AnalysisProps, LayerInteraction {
  readonly layerGraphId?: string;
  readonly activeViolationPairId?: string;
  readonly onClearFocus?: () => void;
  readonly onLayerGraphOpen?: (graphId: string) => void;
  readonly ariaLabel?: string;
}

export function Laymos({
  analysis,
  loadSourceFiles,
  changes,
  loadFileDiff,
  loadDocumentation,
  branches,
  baseRef,
  onBaseRefChange,
  gitAvailable,
  stories,
  className,
}: LaymosProps) {
  return (
    <LaymosExperience
      analysis={analysis}
      loadSourceFiles={loadSourceFiles}
      changes={changes}
      loadFileDiff={loadFileDiff}
      loadDocumentation={loadDocumentation}
      branches={branches}
      baseRef={baseRef}
      onBaseRefChange={onBaseRefChange}
      gitAvailable={gitAvailable}
      stories={stories}
      className={className}
    />
  );
}

export function LayerGraph({
  analysis,
  layerGraphId,
  activeViolationPairId,
  ...interaction
}: LayerGraphProps) {
  const model = useModel(analysis);
  const selected = model.layerGraphs.find(({ id }) => id === layerGraphId);
  const rules = selected?.rules ?? model.rules;
  return (
    <LayerGraphView
      {...interaction}
      layers={model.layers}
      rules={rules}
      layerGraphs={model.layerGraphs}
      activeLayerGraphId={selected?.id}
      activeViolationPair={model.layerViolationPairs.find(
        ({ id }) => id === activeViolationPairId,
      )}
    />
  );
}

interface LayerDetailsProps extends AnalysisProps {
  readonly layerId?: string;
}

export function LayerDetails({
  analysis,
  layerId,
  className,
}: LayerDetailsProps) {
  const model = useModel(analysis);
  return (
    <LayerDetailsView
      className={className}
      layer={model.layers.find(({ id }) => id === layerId)}
    />
  );
}

interface LayerScopeTreeProps
  extends
    AnalysisProps,
    Pick<LayerInteraction, 'activeLayerId' | 'onLayerActivate'> {
  readonly layerGraphId?: string;
  readonly ariaLabel?: string;
}

export function LayerScopeTree({
  analysis,
  layerGraphId,
  ...interaction
}: LayerScopeTreeProps) {
  const model = useModel(analysis);
  const selected = model.layerGraphs.find(({ id }) => id === layerGraphId);
  const layers =
    selected === undefined
      ? model.layers
      : layersReferencedByRules(model.layers, selected.rules);
  return <LayerScopeTreeView {...interaction} layers={layers} />;
}

interface LayerViolationsListProps extends AnalysisProps {
  readonly layerGraphId?: string;
  readonly activeViolationPairId?: string;
  readonly onActiveViolationPairChange?: (id: string | undefined) => void;
}

export function LayerViolationsList({
  analysis,
  layerGraphId,
  activeViolationPairId,
  onActiveViolationPairChange,
  className,
}: LayerViolationsListProps) {
  const model = useModel(analysis);
  const selected = model.layerGraphs.find(({ id }) => id === layerGraphId);
  const visibleLayerIds = new Set(
    (selected === undefined
      ? model.layers
      : layersReferencedByRules(model.layers, selected.rules)
    ).map(({ id }) => id),
  );
  return (
    <LayerViolationsListView
      className={className}
      violationPairs={model.layerViolationPairs.filter(
        ({ fromLayerId, toLayerId }) =>
          visibleLayerIds.has(fromLayerId) && visibleLayerIds.has(toLayerId),
      )}
      coverageViolations={
        selected === undefined ? model.layerCoverageViolations : []
      }
      activeViolationGroupId={activeViolationPairId}
      onActiveViolationGroupChange={onActiveViolationPairChange}
    />
  );
}

interface ModuleGraphProps extends AnalysisProps {
  readonly focusedLayerId?: string;
  readonly showLayerConnections?: boolean;
  readonly activeModuleId?: string;
  readonly activeViolationId?: string;
  readonly onModuleActivate?: (moduleId: string) => void;
  readonly onModuleOpen?: (moduleId: string) => void;
  readonly onModuleGraphOpen?: (graphId: string) => void;
  readonly onLayerActivate?: (layerId: string) => void;
  readonly onClearFocus?: () => void;
}

export function ModuleGraph({
  analysis,
  focusedLayerId,
  showLayerConnections = true,
  activeModuleId,
  activeViolationId,
  onModuleActivate,
  onModuleOpen,
  onModuleGraphOpen,
  onLayerActivate,
  onClearFocus,
  className,
}: ModuleGraphProps) {
  const model = useModel(analysis);
  return (
    <ModuleGraphView
      className={className}
      layers={model.layers}
      rules={model.rules}
      layerGraphs={model.layerGraphs}
      modules={model.modules}
      dependencies={model.moduleDependencies}
      focusedLayerId={focusedLayerId}
      showLayerConnections={showLayerConnections}
      activeModuleId={activeModuleId}
      activeViolation={model.moduleViolations.find(
        ({ id }) => id === activeViolationId,
      )}
      onModuleActivate={onModuleActivate}
      onModuleOpen={onModuleOpen}
      onModuleGraphOpen={onModuleGraphOpen}
      onLayerActivate={onLayerActivate}
      onClearFocus={onClearFocus}
    />
  );
}

interface ModuleTreeProps extends AnalysisProps {
  readonly activeLayerId?: string;
  readonly activeModuleId?: string;
  readonly highlightedModuleIds?: ReadonlySet<string>;
  readonly activeViolationId?: string;
  readonly onLayerActivate?: (layerId: string) => void;
  readonly onModuleActivate?: (moduleId: string) => void;
  readonly onModuleOpen?: (moduleId: string) => void;
}

export function ModuleTree({
  analysis,
  activeLayerId,
  activeModuleId,
  highlightedModuleIds,
  activeViolationId,
  onLayerActivate,
  onModuleActivate,
  onModuleOpen,
  className,
}: ModuleTreeProps) {
  const model = useModel(analysis);
  return (
    <ModuleTreeView
      className={className}
      modules={model.modules}
      layerIdsByPath={layerIdsByBoundaryPath(model.layers)}
      activeLayerId={activeLayerId}
      activeModuleId={activeModuleId}
      highlightedModuleIds={highlightedModuleIds}
      activeViolation={model.moduleViolations.find(
        ({ id }) => id === activeViolationId,
      )}
      onLayerActivate={onLayerActivate}
      onModuleActivate={onModuleActivate}
      onModuleOpen={onModuleOpen}
    />
  );
}

interface ModuleViolationsListProps extends AnalysisProps {
  readonly activeViolationId?: string;
  readonly onActiveViolationChange?: (id: string | undefined) => void;
}

export function ModuleViolationsList({
  analysis,
  activeViolationId,
  onActiveViolationChange,
  className,
}: ModuleViolationsListProps) {
  const model = useModel(analysis);
  return (
    <ModuleViolationsListView
      className={className}
      violations={model.moduleViolations}
      activeViolationId={activeViolationId}
      onActiveViolationChange={onActiveViolationChange}
    />
  );
}

export { ModuleLegend };
export type {
  LoadDocumentation,
  LoadFileDiff,
  LoadSourceFiles,
} from '../module-source';

function useModel(analysis: ArchitectureAnalysis) {
  return useMemo(() => buildPresentationModel(analysis), [analysis]);
}
