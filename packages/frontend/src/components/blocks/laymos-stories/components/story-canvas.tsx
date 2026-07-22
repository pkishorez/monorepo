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
} from 'react';
import type { StoryRun, StoryScenario } from 'laymos/report';

import { Switch } from '#components/ui/switch';
import { cn } from '#lib/utils';

import { useTopAnchoredViewport } from '../hooks/use-top-anchored-viewport';
import { layoutStoryGraph } from '../lib/layout';
import {
  buildProgressiveScenarioGraph,
  buildProgressiveStoryGraph,
  collapseStoryGraph,
  type ProgressiveStoryGraphModel,
} from '../lib/model';
import { viewportWithPreservedAnchor } from '../lib/viewport';
import { progressiveNodeTypes, type ProgressiveNodeData } from './flow-nodes';

function relatedNodeIds(model: ProgressiveStoryGraphModel, nodeId: string) {
  const result = new Set([nodeId]);
  for (const edge of model.edges) {
    if (edge.inactive) continue;
    if (edge.source === nodeId) result.add(edge.target);
    if (edge.target === nodeId) result.add(edge.source);
  }
  return result;
}

function ProgressiveCanvasInner({
  model,
  title,
  description,
  emptyMessage,
  showDetails,
  onShowDetailsChange,
}: {
  readonly model: ProgressiveStoryGraphModel;
  readonly title: string;
  readonly description: string;
  readonly emptyMessage: string;
  readonly showDetails?: boolean;
  readonly onShowDetailsChange?: (show: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const centerSelectedId = useId();
  const { flowToScreenPosition, getViewport, getZoom, setCenter, setViewport } =
    useReactFlow();
  const pendingViewportAnchor = useRef<{
    readonly nodeId: string;
    readonly screenPosition: { readonly x: number; readonly y: number };
  } | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [centerSelected, setCenterSelected] = useState(false);
  const [showDescriptionPopover, setShowDescriptionPopover] = useState(true);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  useEffect(() => {
    setCollapsedNodeIds(new Set());
    setSelectedNodeId(null);
    setHoveredNodeId(null);
  }, [model]);
  const collapsedView = useMemo(
    () => collapseStoryGraph(model, collapsedNodeIds),
    [collapsedNodeIds, model],
  );
  const visibleModel = collapsedView.model;
  const baseLayout = useMemo(
    () => layoutStoryGraph(visibleModel, { compact: true }),
    [visibleModel],
  );
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
        ? relatedNodeIds(visibleModel, activeNodeId)
        : new Set<string>(),
    [activeNodeId, visibleModel],
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
        ? relatedNodeIds(visibleModel, hoverWithinSelection)
        : new Set<string>(),
    [hoverWithinSelection, visibleModel],
  );
  const nodes = useMemo<Node<ProgressiveNodeData>[]>(
    () =>
      baseLayout.nodes.map((node) => ({
        ...node,
        type: 'progressive-block',
        zIndex: selectedNodeId === node.id ? 10 : node.zIndex,
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
          showDescriptionPopover,
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
      selectedNodeId,
      showDescriptionPopover,
    ],
  );
  const edges = useMemo<Edge[]>(
    () =>
      baseLayout.edges.map((edge) => {
        const inactive = edge.data?.inactive === true;
        const inActiveScope =
          !inactive &&
          activeNodeId !== null &&
          (edge.source === activeNodeId || edge.target === activeNodeId);
        const hoverRefiningSelection = hoverWithinSelection !== null;
        const touchesHoveredNode =
          hoverWithinSelection !== null &&
          (edge.source === hoverWithinSelection ||
            edge.target === hoverWithinSelection);
        const highlighted =
          inActiveScope && (!hoverRefiningSelection || touchesHoveredNode);
        const dimmed = inactive || (activeNodeId !== null && !inActiveScope);
        return {
          ...edge,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: highlighted ? 16 : 13,
            height: highlighted ? 16 : 13,
            color: inactive ? 'var(--muted-foreground)' : 'var(--primary)',
          },
          style: {
            ...edge.style,
            opacity: inactive ? 0.12 : dimmed ? 0.06 : highlighted ? 1 : 0.5,
            strokeWidth: highlighted ? 3 : dimmed ? 1 : 1.5,
          },
          zIndex: highlighted ? 3 : dimmed ? 0 : 1,
        };
      }),
    [activeNodeId, baseLayout.edges, hoverWithinSelection],
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
          const selecting = selectedNodeId !== node.id;
          setSelectedNodeId(selecting ? node.id : null);
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
          setHoveredNodeId(node.id);
        }}
        onNodeMouseLeave={() => setHoveredNodeId(null)}
        onNodeContextMenu={(
          event: MouseEvent,
          node: Node<ProgressiveNodeData>,
        ) => {
          event.preventDefault();
          const graphNode = node.data.graphNode;
          if (graphNode.kind === 'arm' && !graphNode.active) return;
          const expanding = collapsedNodeIds.has(node.id);
          const hiddenCount = collapseStoryGraph(
            model,
            new Set([node.id]),
          ).hiddenCountByNode.get(node.id);
          if (!expanding && !hiddenCount) return;
          pendingViewportAnchor.current = {
            nodeId: node.id,
            screenPosition: flowToScreenPosition({
              x: node.position.x + (node.width ?? 0) / 2,
              y: node.position.y + (node.height ?? 0) / 2,
            }),
          };
          setSelectedNodeId(null);
          setHoveredNodeId(null);
          setCollapsedNodeIds((current) => {
            const next = new Set(current);
            if (expanding) next.delete(node.id);
            else next.add(node.id);
            return next;
          });
        }}
        onPaneClick={() => setSelectedNodeId(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--border)" gap={24} />
        <Panel position="top-left">
          <div className="nodrag nopan max-w-sm rounded-md border border-border bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
            <p className="text-xs font-semibold">{title}</p>
            <p className="mt-0.5 line-clamp-1 text-[9px] text-muted-foreground">
              {description}
            </p>
          </div>
        </Panel>
        <Panel position="top-right">
          <div className="nodrag nopan grid gap-2 rounded-md border border-border bg-background/95 px-2.5 py-2 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur">
            {onShowDetailsChange && (
              <label className="flex cursor-pointer items-center justify-between gap-4">
                Show details
                <Switch
                  size="sm"
                  checked={showDetails}
                  onCheckedChange={onShowDetailsChange}
                  aria-label="Show detail blocks"
                />
              </label>
            )}
            <label className="flex cursor-pointer items-center justify-between gap-4">
              Description popover
              <Switch
                size="sm"
                checked={showDescriptionPopover}
                onCheckedChange={setShowDescriptionPopover}
                aria-label="Show description popovers"
              />
            </label>
            <label
              htmlFor={centerSelectedId}
              className="flex cursor-pointer items-center justify-between gap-4"
            >
              Center selected
              <Switch
                id={centerSelectedId}
                size="sm"
                checked={centerSelected}
                onCheckedChange={setCenterSelected}
                aria-label="Center selected nodes"
              />
            </label>
          </div>
        </Panel>
        <Panel position="bottom-left">
          <p className="nodrag nopan rounded bg-background/90 px-2 py-1 text-[9px] text-muted-foreground shadow-sm">
            click to focus · hover connections · right-click to collapse
          </p>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function StoryCanvas({ story }: { readonly story: StoryRun }) {
  const [showDetails, setShowDetails] = useState(true);
  const visibleStory = useMemo(
    () => (showDetails ? story : primaryStory(story)),
    [showDetails, story],
  );
  const model = useMemo(
    () => buildProgressiveStoryGraph(visibleStory),
    [visibleStory],
  );
  return (
    <ReactFlowProvider>
      <ProgressiveCanvasInner
        model={model}
        title={story.name}
        description={story.description}
        emptyMessage="No observed blocks in this story"
        showDetails={showDetails}
        onShowDetailsChange={setShowDetails}
      />
    </ReactFlowProvider>
  );
}

export function primaryStory(story: StoryRun): StoryRun {
  const blocks = Object.fromEntries(
    Object.entries(story.blocks).flatMap(([blockId, block]) => {
      if (block.visibility === 'detail') return [];
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
      if (story.blocks[item.blockId]?.visibility === 'detail') {
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
}: {
  readonly story: StoryRun;
  readonly scenario: StoryScenario;
}) {
  const model = useMemo(
    () => buildProgressiveScenarioGraph(story, scenario),
    [scenario, story],
  );
  return (
    <ReactFlowProvider>
      <ProgressiveCanvasInner
        model={model}
        title={scenario.name}
        description={scenario.description}
        emptyMessage={
          scenario.outcome === 'skipped'
            ? 'This scenario was skipped'
            : 'No blocks were observed in this scenario'
        }
      />
    </ReactFlowProvider>
  );
}
