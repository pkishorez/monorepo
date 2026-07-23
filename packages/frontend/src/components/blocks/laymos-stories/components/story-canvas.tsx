import '@xyflow/react/dist/style.css';

import {
  Background,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { StoryRun, StoryScenario } from 'laymos/report';
import { ChevronUp, SlidersHorizontal } from 'lucide-react';

import { Switch } from '#components/ui/switch';
import { cn } from '#lib/utils';

import { useTopAnchoredViewport } from '../hooks/use-top-anchored-viewport';
import { layoutStoryGraph } from '../lib/layout';
import {
  applyStoryExecutionCoverage,
  buildProgressiveScenarioGraph,
  buildProgressiveStoryGraph,
  buildStoryExecutionCoverage,
  collapseStoryGraph,
  compactValueDecisions,
  storyNodeExecutionCoverage,
  withoutFlowNodes,
  type ProgressiveStoryGraphModel,
  type StoryExecutionCoverage,
} from '../lib/model';
import { viewportWithPreservedAnchor } from '../lib/viewport';
import type { LaymosStoryCanvasPreferences } from '../types';
import { progressiveNodeTypes, type ProgressiveNodeData } from './flow-nodes';

export function relatedNodeIds(
  model: ProgressiveStoryGraphModel,
  nodeId: string,
  includeOwningDecisions = false,
) {
  const result = new Set([nodeId]);
  const node = model.nodes.find(({ id }) => id === nodeId);
  if (node?.kind === 'block' && node.block.kind === 'flow') {
    const pending = [...(model.childrenByNode[nodeId] ?? [])];
    while (pending.length > 0) {
      const childId = pending.pop()!;
      if (result.has(childId)) continue;
      result.add(childId);
      pending.push(...(model.childrenByNode[childId] ?? []));
      for (const candidate of model.nodes) {
        if (candidate.kind === 'arm' && candidate.decisionId === childId) {
          result.add(candidate.id);
        }
      }
    }
  }
  for (const edge of model.edges) {
    if (edge.inactive) continue;
    if (edge.source === nodeId) result.add(edge.target);
    if (edge.target === nodeId) result.add(edge.source);
  }
  if (includeOwningDecisions) {
    for (const candidate of model.nodes) {
      if (candidate.kind === 'arm' && result.has(candidate.id)) {
        result.add(candidate.decisionId);
      }
    }
  }
  return result;
}

export function executionCoverageStatus(
  coverage: StoryExecutionCoverage,
): 'covered' | 'partial' | 'uncovered' | 'empty' {
  const covered = coverage.blocks.covered + coverage.arms.covered;
  const total = coverage.blocks.total + coverage.arms.total;
  if (total === 0) return 'empty';
  if (covered === total) return 'covered';
  if (covered === 0) return 'uncovered';
  return 'partial';
}

function ExecutionCoverageSummary({
  coverage,
}: {
  readonly coverage?: StoryExecutionCoverage;
}) {
  if (!coverage) {
    return (
      <div className="nodrag nopan rounded-lg border border-border/60 bg-background/90 px-3 py-2 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
        <p className="font-semibold text-foreground">Execution coverage</p>
        <p className="mt-1">Run Story to measure coverage.</p>
      </div>
    );
  }

  const status = executionCoverageStatus(coverage);
  const presentation = {
    covered: {
      label: 'All covered',
      tone: 'bg-emerald-500',
      text: 'text-emerald-700 dark:text-emerald-300',
    },
    partial: {
      label: 'Partial coverage',
      tone: 'bg-amber-400',
      text: 'text-amber-700 dark:text-amber-300',
    },
    uncovered: {
      label: 'None covered',
      tone: 'bg-rose-500',
      text: 'text-rose-700 dark:text-rose-300',
    },
    empty: {
      label: 'Nothing to cover',
      tone: 'bg-muted-foreground',
      text: 'text-muted-foreground',
    },
  }[status];

  return (
    <div className="nodrag nopan rounded-lg border border-border/60 bg-background/90 px-3 py-2 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
      <p
        className={`flex items-center gap-1.5 font-semibold ${presentation.text}`}
      >
        <span
          className={`size-1.5 rounded-full ${presentation.tone}`}
          aria-hidden
        />
        {presentation.label}
      </p>
      <p className="mt-1 tabular-nums">
        Blocks {coverage.blocks.covered}/{coverage.blocks.total} · Arms{' '}
        {coverage.arms.covered}/{coverage.arms.total}
      </p>
    </div>
  );
}

function ProgressiveCanvasInner({
  model,
  emptyMessage,
  showDetails,
  onShowDetailsChange,
  showDescriptionPopover,
  onShowDescriptionPopoverChange,
  centerSelected,
  onCenterSelectedChange,
  showExecutionCoverage,
  onShowExecutionCoverageChange,
  openCodeOnSelect,
  onOpenCodeOnSelectChange,
  executionCoverage,
  executionCoverageSummary,
  selectedNodeId: controlledSelectedNodeId,
  onSelectedNodeIdChange,
  onHoveredNodeIdChange,
  onNodeClick,
  onGraphNodesChange,
  centerNodeRequest,
  renderNodeActions,
}: {
  readonly model: ProgressiveStoryGraphModel;
  readonly emptyMessage: string;
  readonly showDetails?: boolean;
  readonly onShowDetailsChange?: (show: boolean) => void;
  readonly showDescriptionPopover: boolean;
  readonly onShowDescriptionPopoverChange: (show: boolean) => void;
  readonly centerSelected: boolean;
  readonly onCenterSelectedChange: (center: boolean) => void;
  readonly showExecutionCoverage?: boolean;
  readonly onShowExecutionCoverageChange?: (show: boolean) => void;
  readonly openCodeOnSelect: boolean;
  readonly onOpenCodeOnSelectChange?: (open: boolean) => void;
  readonly executionCoverage?: StoryExecutionCoverage;
  readonly executionCoverageSummary?: StoryExecutionCoverage;
  readonly selectedNodeId?: string | null;
  readonly onSelectedNodeIdChange?: (nodeId: string | null) => void;
  readonly onHoveredNodeIdChange?: (nodeId: string | null) => void;
  readonly onNodeClick?: (
    node: ProgressiveStoryGraphModel['nodes'][number],
    context: { readonly modified: boolean },
  ) => void;
  readonly onGraphNodesChange?: (
    nodes: readonly ProgressiveStoryGraphModel['nodes'][number][],
  ) => void;
  readonly centerNodeRequest?: {
    readonly nodeId: string;
    readonly requestId: number;
  } | null;
  readonly renderNodeActions?: (
    node: ProgressiveStoryGraphModel['nodes'][number],
  ) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const centerSelectedId = useId();
  const { flowToScreenPosition, getViewport, getZoom, setCenter, setViewport } =
    useReactFlow();
  const pendingViewportAnchor = useRef<{
    readonly nodeId: string;
    readonly screenPosition: { readonly x: number; readonly y: number };
  } | null>(null);
  const [localSelectedNodeId, setLocalSelectedNodeId] = useState<string | null>(
    null,
  );
  const selectedNodeId =
    controlledSelectedNodeId === undefined
      ? localSelectedNodeId
      : controlledSelectedNodeId;
  const setSelectedNodeId = (nodeId: string | null) => {
    setLocalSelectedNodeId(nodeId);
    onSelectedNodeIdChange?.(nodeId);
  };
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const setHoveredNode = (nodeId: string | null) => {
    setHoveredNodeId(nodeId);
    onHoveredNodeIdChange?.(nodeId);
  };
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const coverageModel = useMemo(
    () =>
      showExecutionCoverage && executionCoverage
        ? applyStoryExecutionCoverage(model, executionCoverage)
        : model,
    [executionCoverage, model, showExecutionCoverage],
  );
  const compactModel = useMemo(
    () => compactValueDecisions(coverageModel),
    [coverageModel],
  );
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  useEffect(() => {
    setCollapsedNodeIds(new Set());
    setHoveredNode(null);
    if (controlledSelectedNodeId === undefined && selectedNodeId !== null)
      setSelectedNodeId(null);
  }, [model]);
  const collapsedView = useMemo(
    () => collapseStoryGraph(compactModel, collapsedNodeIds),
    [collapsedNodeIds, compactModel],
  );
  const visibleModel = useMemo(
    () => withoutFlowNodes(collapsedView.model),
    [collapsedView.model],
  );
  useEffect(() => {
    onGraphNodesChange?.(visibleModel.nodes);
  }, [onGraphNodesChange, visibleModel.nodes]);
  const graphNodeById = useMemo(
    () => new Map(visibleModel.nodes.map((node) => [node.id, node])),
    [visibleModel.nodes],
  );
  const baseLayout = useMemo(
    () => layoutStoryGraph(visibleModel, { compact: true }),
    [visibleModel],
  );
  useEffect(() => {
    if (!centerNodeRequest) return;
    const node = baseLayout.nodes.find(
      (candidate) => candidate.id === centerNodeRequest.nodeId,
    );
    if (!node) return;
    void setCenter(
      node.position.x + (node.width ?? 0) / 2,
      node.position.y + (node.height ?? 0) / 2,
      {
        zoom: getZoom(),
        duration: 240,
        ease: (progress) =>
          progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2,
      },
    );
  }, [baseLayout.nodes, centerNodeRequest, getZoom, setCenter]);
  const fitted = useTopAnchoredViewport(containerRef, baseLayout.nodes, model);
  useLayoutEffect(() => {
    const anchor = pendingViewportAnchor.current;
    if (anchor === null) return;
    pendingViewportAnchor.current = null;
    const node = baseLayout.nodes.find(({ id }) => id === anchor.nodeId);
    if (node === undefined) return;
    const nextScreenPosition = flowToScreenPosition({
      x: node.position.x + (node.width ?? 0) / 2,
      y: node.position.y + (node.height ?? 0) / 2,
    });
    void setViewport(
      viewportWithPreservedAnchor(
        getViewport(),
        anchor.screenPosition,
        nextScreenPosition,
      ),
    );
  }, [baseLayout.nodes, flowToScreenPosition, getViewport, setViewport]);
  const activeNodeId = selectedNodeId ?? hoveredNodeId;
  const activeRelated = useMemo(
    () =>
      activeNodeId
        ? relatedNodeIds(visibleModel, activeNodeId, selectedNodeId === null)
        : new Set<string>(),
    [activeNodeId, selectedNodeId, visibleModel],
  );
  const hoverWithinSelection =
    selectedNodeId && hoveredNodeId && activeRelated.has(hoveredNodeId)
      ? hoveredNodeId
      : null;
  const highlightedHoveredNodeId = selectedNodeId
    ? hoverWithinSelection
    : hoveredNodeId;
  const hoverRelated = useMemo(
    () =>
      hoverWithinSelection
        ? relatedNodeIds(visibleModel, hoverWithinSelection, true)
        : new Set<string>(),
    [hoverWithinSelection, visibleModel],
  );
  const nodes = useMemo<Node<ProgressiveNodeData>[]>(
    () =>
      baseLayout.nodes.map((node) => ({
        ...node,
        type: 'progressive-block',
        zIndex:
          node.data.inline === true
            ? node.zIndex
            : selectedNodeId === node.id
              ? 20
              : node.zIndex,
        data: {
          graphNode: node.data.graphNode,
          selected: selectedNodeId === node.id,
          hovered: highlightedHoveredNodeId === node.id,
          related: activeNodeId !== null && activeRelated.has(node.id),
          dimmed: activeNodeId !== null && !activeRelated.has(node.id),
          muted:
            hoverWithinSelection !== null &&
            !hoverRelated.has(node.id) &&
            node.id !== selectedNodeId,
          hiddenNodeCount: collapsedView.hiddenCountByNode.get(node.id) ?? 0,
          coverage:
            showExecutionCoverage && executionCoverage
              ? storyNodeExecutionCoverage(
                  executionCoverage,
                  node.id,
                  new Set([
                    ...(collapsedView.hiddenNodeIdsByNode.get(node.id) ?? []),
                    ...model.nodes.flatMap((candidate) =>
                      node.data.graphNode.kind === 'block' &&
                      node.data.graphNode.block.kind === 'decision' &&
                      node.data.graphNode.block.role === 'value' &&
                      candidate.kind === 'arm' &&
                      candidate.decisionId === node.id
                        ? [candidate.id]
                        : [],
                    ),
                  ]),
                )
              : undefined,
          showDescriptionPopover,
          inline: node.data.inline,
          scopeDepth: node.data.scopeDepth,
          actions:
            selectedNodeId === node.id
              ? renderNodeActions?.(node.data.graphNode)
              : undefined,
        },
      })),
    [
      baseLayout.nodes,
      activeNodeId,
      activeRelated,
      highlightedHoveredNodeId,
      hoverRelated,
      hoverWithinSelection,
      collapsedView.hiddenCountByNode,
      collapsedView.hiddenNodeIdsByNode,
      executionCoverage,
      model.nodes,
      selectedNodeId,
      showDescriptionPopover,
      renderNodeActions,
      showExecutionCoverage,
    ],
  );
  const edges = useMemo<Edge[]>(
    () =>
      baseLayout.edges.map((edge) => {
        const inactive = edge.data?.inactive === true;
        const uncovered =
          showExecutionCoverage &&
          executionCoverage !== undefined &&
          edge.data?.executionCovered !== true;
        const inActiveScope =
          !inactive &&
          activeNodeId !== null &&
          activeRelated.has(edge.source) &&
          activeRelated.has(edge.target);
        const hoverRefiningSelection = hoverWithinSelection !== null;
        const touchesHoveredNode =
          hoverWithinSelection !== null &&
          (edge.source === hoverWithinSelection ||
            edge.target === hoverWithinSelection);
        const highlighted =
          inActiveScope && (!hoverRefiningSelection || touchesHoveredNode);
        const dimmed =
          inactive || uncovered || (activeNodeId !== null && !inActiveScope);
        const target = graphNodeById.get(edge.target);
        const terminalColor =
          target?.kind === 'block' && target.block.kind === 'terminal'
            ? target.block.completion?.kind === 'success'
              ? '#10b981'
              : target.block.completion?.kind === 'error'
                ? '#f43f5e'
                : '#64748b'
            : undefined;
        const color = uncovered
          ? '#f43f5e'
          : showExecutionCoverage && executionCoverage
            ? highlighted
              ? 'var(--primary)'
              : '#10b981'
            : inactive
              ? 'var(--muted-foreground)'
              : (terminalColor ??
                (highlighted ? 'var(--primary)' : 'var(--muted-foreground)'));
        return {
          ...edge,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: highlighted ? 16 : 13,
            height: highlighted ? 16 : 13,
            color,
          },
          style: {
            ...edge.style,
            stroke: color,
            opacity:
              inactive || uncovered
                ? 0.12
                : dimmed
                  ? 0.06
                  : highlighted
                    ? 1
                    : 0.5,
            strokeWidth: highlighted ? 3 : dimmed ? 1 : 1.5,
            strokeDasharray: uncovered ? '4 5' : edge.style?.strokeDasharray,
          },
          zIndex: highlighted ? 3 : dimmed ? 0 : 1,
        };
      }),
    [
      activeNodeId,
      activeRelated,
      baseLayout.edges,
      graphNodeById,
      hoverWithinSelection,
      executionCoverage,
      showExecutionCoverage,
    ],
  );
  if (model.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'h-full w-full transition-opacity duration-150',
        fitted ? 'opacity-100' : 'opacity-0',
      )}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={progressiveNodeTypes}
        minZoom={0.1}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        onNodeClick={(_event: MouseEvent, node: Node<ProgressiveNodeData>) => {
          if (node.data.graphNode.kind === 'arm' && !node.data.graphNode.active)
            return;
          const modified = _event.metaKey || _event.ctrlKey;
          const selecting = modified || selectedNodeId !== node.id;
          setSelectedNodeId(selecting ? node.id : null);
          onNodeClick?.(node.data.graphNode, { modified });
          if (!selecting || !centerSelected) return;
          void setCenter(
            node.position.x + (node.width ?? 0) / 2,
            node.position.y + (node.height ?? 0) / 2,
            {
              zoom: getZoom(),
              duration: 200,
              ease: (progress) => 1 - (1 - progress) ** 3,
            },
          );
        }}
        onNodeMouseEnter={(
          _event: MouseEvent,
          node: Node<ProgressiveNodeData>,
        ) => {
          if (node.data.graphNode.kind === 'arm' && !node.data.graphNode.active)
            return;
          setHoveredNode(node.id);
        }}
        onNodeMouseLeave={() => setHoveredNode(null)}
        onNodeContextMenu={(
          event: MouseEvent,
          node: Node<ProgressiveNodeData>,
        ) => {
          event.preventDefault();
          const graphNode = node.data.graphNode;
          if (graphNode.kind === 'arm' && !graphNode.active) return;
          const flowStartNodeId =
            graphNode.kind === 'block' && graphNode.block.kind === 'flow'
              ? model.nodes.find(
                  (candidate) =>
                    candidate.kind === 'block' &&
                    candidate.startsFlows?.some((flow) => flow.id === node.id),
                )?.id
              : undefined;
          const collapseNodeId = flowStartNodeId ?? node.id;
          const expanding = collapsedNodeIds.has(collapseNodeId);
          const hiddenCount = collapseStoryGraph(
            model,
            new Set([collapseNodeId]),
          ).hiddenCountByNode.get(collapseNodeId);
          if (!expanding && !hiddenCount) return;
          const flowStartNode =
            flowStartNodeId === undefined
              ? undefined
              : baseLayout.nodes.find(
                  (candidate) => candidate.id === flowStartNodeId,
                );
          const anchorNode =
            !expanding && flowStartNode !== undefined ? flowStartNode : node;
          pendingViewportAnchor.current = {
            nodeId: collapseNodeId,
            screenPosition: flowToScreenPosition({
              x: anchorNode.position.x + (anchorNode.width ?? 0) / 2,
              y: anchorNode.position.y + (anchorNode.height ?? 0) / 2,
            }),
          };
          setSelectedNodeId(null);
          setHoveredNodeId(null);
          setCollapsedNodeIds((current) => {
            const next = new Set(current);
            if (expanding) next.delete(collapseNodeId);
            else next.add(collapseNodeId);
            return next;
          });
        }}
        onPaneClick={() => setSelectedNodeId(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--border)" gap={24} />
        <Panel position="top-right">
          <div className="grid justify-items-end gap-2">
            {controlsExpanded ? (
              <div className="nodrag nopan w-60 overflow-hidden rounded-xl border border-border/80 bg-background/95 p-2 shadow-xl backdrop-blur">
                <div className="flex items-center justify-between gap-4 px-2 py-1.5 text-xs font-semibold text-foreground">
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="size-3.5" aria-hidden />
                    Graph controls
                  </span>
                  <button
                    type="button"
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => setControlsExpanded(false)}
                    aria-label="Minimize graph controls"
                    title="Minimize controls"
                  >
                    <ChevronUp className="size-3" aria-hidden />
                  </button>
                </div>
                <div className="mt-1 grid gap-0.5 border-t border-border/60 pt-1">
                  {onShowDetailsChange && (
                    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg px-2 py-2 text-xs text-foreground transition-colors hover:bg-muted/60">
                      Show details
                      <Switch
                        size="sm"
                        checked={showDetails}
                        onCheckedChange={onShowDetailsChange}
                        aria-label="Show detail blocks"
                      />
                    </label>
                  )}
                  {onShowExecutionCoverageChange && (
                    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg px-2 py-2 text-xs text-foreground transition-colors hover:bg-muted/60">
                      Show execution coverage
                      <Switch
                        size="sm"
                        checked={showExecutionCoverage}
                        onCheckedChange={onShowExecutionCoverageChange}
                        aria-label="Show execution coverage"
                      />
                    </label>
                  )}
                  <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg px-2 py-2 text-xs text-foreground transition-colors hover:bg-muted/60">
                    Show descriptions
                    <Switch
                      size="sm"
                      checked={showDescriptionPopover}
                      onCheckedChange={onShowDescriptionPopoverChange}
                      aria-label="Show description popovers"
                    />
                  </label>
                  {onOpenCodeOnSelectChange && (
                    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg px-2 py-2 text-xs text-foreground transition-colors hover:bg-muted/60">
                      Open code on select
                      <Switch
                        size="sm"
                        checked={openCodeOnSelect}
                        onCheckedChange={onOpenCodeOnSelectChange}
                        aria-label="Open code when selecting nodes"
                      />
                    </label>
                  )}
                  <label
                    htmlFor={centerSelectedId}
                    className="flex cursor-pointer items-center justify-between gap-4 rounded-lg px-2 py-2 text-xs text-foreground transition-colors hover:bg-muted/60"
                  >
                    Center selected
                    <Switch
                      id={centerSelectedId}
                      size="sm"
                      checked={centerSelected}
                      onCheckedChange={onCenterSelectedChange}
                      aria-label="Center selected nodes"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="nodrag nopan flex size-8 items-center justify-center rounded-md border border-border bg-background/95 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setControlsExpanded(true)}
                aria-label="Expand graph controls"
                title="Graph controls"
              >
                <SlidersHorizontal className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        </Panel>
        {showExecutionCoverage && (
          <Panel position="top-left" className="!left-3 !top-14 !m-0">
            <ExecutionCoverageSummary coverage={executionCoverageSummary} />
          </Panel>
        )}
        <Panel position="bottom-left">
          <p className="nodrag nopan rounded bg-background/90 px-2 py-1 text-[9px] text-muted-foreground shadow-sm">
            click to focus · hover connections · right-click to collapse
          </p>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function StoryCanvas({
  story,
  run,
  preferences,
  onPreferencesChange,
  selectedNodeId,
  onSelectedNodeIdChange,
  onHoveredNodeIdChange,
  onNodeClick,
  onGraphNodesChange,
  openCodeOnSelect,
  onOpenCodeOnSelectChange,
  centerNodeRequest,
  renderNodeActions,
}: {
  readonly story: StoryRun;
  readonly run?: StoryRun;
  readonly preferences: LaymosStoryCanvasPreferences;
  readonly onPreferencesChange: (
    preferences: LaymosStoryCanvasPreferences,
  ) => void;
  readonly selectedNodeId?: string | null;
  readonly onSelectedNodeIdChange?: (nodeId: string | null) => void;
  readonly onHoveredNodeIdChange?: (nodeId: string | null) => void;
  readonly onNodeClick?: Parameters<
    typeof ProgressiveCanvasInner
  >[0]['onNodeClick'];
  readonly onGraphNodesChange?: Parameters<
    typeof ProgressiveCanvasInner
  >[0]['onGraphNodesChange'];
  readonly openCodeOnSelect: boolean;
  readonly onOpenCodeOnSelectChange?: (open: boolean) => void;
  readonly centerNodeRequest?: Parameters<
    typeof ProgressiveCanvasInner
  >[0]['centerNodeRequest'];
  readonly renderNodeActions?: Parameters<
    typeof ProgressiveCanvasInner
  >[0]['renderNodeActions'];
}) {
  const {
    showDetails,
    showDescriptionPopover,
    centerSelected,
    showExecutionCoverage = false,
  } = preferences;
  const visibleStory = useMemo(
    () => (showDetails ? story : primaryStory(story)),
    [showDetails, story],
  );
  const model = useMemo(
    () => buildProgressiveStoryGraph(visibleStory),
    [visibleStory],
  );
  const visibleRun = useMemo(
    () => (run && !showDetails ? primaryStory(run) : run),
    [run, showDetails],
  );
  const executionCoverage = useMemo(
    () =>
      visibleRun
        ? buildStoryExecutionCoverage(visibleStory, visibleRun)
        : undefined,
    [visibleRun, visibleStory],
  );
  const executionCoverageSummary = useMemo(
    () => (run ? buildStoryExecutionCoverage(story, run) : undefined),
    [run, story],
  );
  return (
    <ReactFlowProvider>
      <ProgressiveCanvasInner
        model={model}
        emptyMessage="No observed blocks in this story"
        showDetails={showDetails}
        onShowDetailsChange={(show) =>
          onPreferencesChange({ ...preferences, showDetails: show })
        }
        showDescriptionPopover={showDescriptionPopover}
        onShowDescriptionPopoverChange={(show) =>
          onPreferencesChange({ ...preferences, showDescriptionPopover: show })
        }
        centerSelected={centerSelected}
        onCenterSelectedChange={(center) =>
          onPreferencesChange({ ...preferences, centerSelected: center })
        }
        showExecutionCoverage={showExecutionCoverage}
        onShowExecutionCoverageChange={(show) =>
          onPreferencesChange({ ...preferences, showExecutionCoverage: show })
        }
        openCodeOnSelect={openCodeOnSelect}
        onOpenCodeOnSelectChange={onOpenCodeOnSelectChange}
        executionCoverage={executionCoverage}
        executionCoverageSummary={executionCoverageSummary}
        selectedNodeId={selectedNodeId}
        onSelectedNodeIdChange={onSelectedNodeIdChange}
        onHoveredNodeIdChange={onHoveredNodeIdChange}
        onNodeClick={onNodeClick}
        onGraphNodesChange={onGraphNodesChange}
        centerNodeRequest={centerNodeRequest}
        renderNodeActions={renderNodeActions}
      />
    </ReactFlowProvider>
  );
}

export function primaryStory(story: StoryRun): StoryRun {
  const blocks = Object.fromEntries(
    Object.entries(story.blocks).flatMap(([blockId, block]) => {
      if (block.visibility === 'detail' && block.kind !== 'flow') return [];
      return [
        [
          blockId,
          block.kind === 'decision'
            ? {
                ...block,
                arms: block.arms.filter((arm) => arm.visibility !== 'detail'),
              }
            : block,
        ],
      ];
    }),
  );
  const filterPath = (path: StoryScenario['execution']) =>
    path.flatMap((item): StoryScenario['execution'] => {
      if ('parallel' in item) {
        const parallel = item.parallel
          .map(filterPath)
          .filter((branch) => branch.length > 0);
        return parallel.length === 0 ? [] : [{ parallel }];
      }
      const block = story.blocks[item.blockId];
      if (block?.visibility === 'detail' && block.kind !== 'flow') {
        return filterPath(item.children);
      }
      if (!(item.blockId in blocks)) return [];
      return [{ ...item, children: filterPath(item.children) }];
    });
  return {
    ...story,
    blocks,
    scenarios: story.scenarios.map((scenario) => ({
      ...scenario,
      execution: filterPath(scenario.execution),
    })),
  };
}

export function ScenarioCanvas({
  story,
  scenario,
  preferences,
  onPreferencesChange,
  selectedNodeId,
  onSelectedNodeIdChange,
  onHoveredNodeIdChange,
  onNodeClick,
  onGraphNodesChange,
  openCodeOnSelect,
  onOpenCodeOnSelectChange,
  centerNodeRequest,
  renderNodeActions,
}: {
  readonly story: StoryRun;
  readonly scenario: StoryScenario;
  readonly preferences: LaymosStoryCanvasPreferences;
  readonly onPreferencesChange: (
    preferences: LaymosStoryCanvasPreferences,
  ) => void;
  readonly selectedNodeId?: string | null;
  readonly onSelectedNodeIdChange?: (nodeId: string | null) => void;
  readonly onHoveredNodeIdChange?: (nodeId: string | null) => void;
  readonly onNodeClick?: Parameters<
    typeof ProgressiveCanvasInner
  >[0]['onNodeClick'];
  readonly onGraphNodesChange?: Parameters<
    typeof ProgressiveCanvasInner
  >[0]['onGraphNodesChange'];
  readonly openCodeOnSelect: boolean;
  readonly onOpenCodeOnSelectChange?: (open: boolean) => void;
  readonly centerNodeRequest?: Parameters<
    typeof ProgressiveCanvasInner
  >[0]['centerNodeRequest'];
  readonly renderNodeActions?: Parameters<
    typeof ProgressiveCanvasInner
  >[0]['renderNodeActions'];
}) {
  const model = useMemo(
    () => buildProgressiveScenarioGraph(story, scenario),
    [scenario, story],
  );
  return (
    <ReactFlowProvider>
      <ProgressiveCanvasInner
        model={model}
        emptyMessage={
          scenario.outcome === 'skipped'
            ? 'This scenario was skipped'
            : 'No blocks were observed in this scenario'
        }
        showDescriptionPopover={preferences.showDescriptionPopover}
        onShowDescriptionPopoverChange={(show) =>
          onPreferencesChange({ ...preferences, showDescriptionPopover: show })
        }
        centerSelected={preferences.centerSelected}
        onCenterSelectedChange={(center) =>
          onPreferencesChange({ ...preferences, centerSelected: center })
        }
        openCodeOnSelect={openCodeOnSelect}
        onOpenCodeOnSelectChange={onOpenCodeOnSelectChange}
        selectedNodeId={selectedNodeId}
        onSelectedNodeIdChange={onSelectedNodeIdChange}
        onHoveredNodeIdChange={onHoveredNodeIdChange}
        onNodeClick={onNodeClick}
        onGraphNodesChange={onGraphNodesChange}
        centerNodeRequest={centerNodeRequest}
        renderNodeActions={renderNodeActions}
      />
    </ReactFlowProvider>
  );
}
