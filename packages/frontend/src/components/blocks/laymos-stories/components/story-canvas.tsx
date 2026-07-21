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
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import type { StoryArtifact, StoryScenario } from 'laymos/report';

import { Switch } from '#components/ui/switch';
import { cn } from '#lib/utils';

import { useTopAnchoredViewport } from '../hooks/use-top-anchored-viewport';
import { layoutStoryGraph } from '../lib/layout';
import {
  buildProgressiveScenarioGraph,
  buildProgressiveStoryGraph,
  collapseStoryGraph,
  type ProgressiveStoryGraphModel,
  type StoryBlockGraphNode,
} from '../lib/model';
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

function NodeDisclosure({
  node,
  children,
  incomingCount,
  outgoingCount,
  minimised,
  onMinimisedChange,
}: {
  readonly node: StoryBlockGraphNode;
  readonly children: readonly StoryBlockGraphNode[];
  readonly incomingCount: number;
  readonly outgoingCount: number;
  readonly minimised: boolean;
  readonly onMinimisedChange: (minimised: boolean) => void;
}) {
  if (minimised) {
    return (
      <button
        type="button"
        className="nodrag nopan nowheel flex items-center gap-1.5 rounded-md border border-border bg-background/95 px-2.5 py-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
        onClick={() => onMinimisedChange(false)}
        aria-label={`Show details for ${node.block.name}`}
        aria-expanded={false}
      >
        <ChevronDown className="size-3.5" aria-hidden />
        Details
      </button>
    );
  }

  return (
    <aside
      role="button"
      tabIndex={0}
      className="nodrag nopan nowheel relative w-64 rounded-md border border-border bg-background/95 p-3 pr-9 text-left shadow-md backdrop-blur transition-colors hover:border-primary/40"
      onClick={() => onMinimisedChange(true)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onMinimisedChange(true);
      }}
      aria-label={`Hide details for ${node.block.name}`}
      aria-expanded={true}
    >
      <ChevronUp
        className="absolute right-3 top-3 size-3.5 text-muted-foreground"
        aria-hidden
      />
      <p className="text-[11px] font-semibold">{node.block.name}</p>
      {node.block.description && (
        <p className="mt-1 text-[9px] leading-3 text-muted-foreground">
          {node.block.description}
        </p>
      )}
      <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-border pt-2">
        {[
          ['Incoming', incomingCount],
          ['Outgoing', outgoingCount],
          ['Contains', children.length],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-[8px] uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd className="text-xs font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {children.length > 0 && (
        <p className="mt-2 line-clamp-2 border-t border-border pt-2 text-[9px] text-muted-foreground">
          Runs inside: {children.map((child) => child.block.name).join(', ')}
        </p>
      )}
    </aside>
  );
}

function ProgressiveCanvasInner({
  model,
  title,
  description,
  emptyMessage,
}: {
  readonly model: ProgressiveStoryGraphModel;
  readonly title: string;
  readonly description: string;
  readonly emptyMessage: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const centerSelectedId = useId();
  const { getZoom, setCenter } = useReactFlow();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [detailsMinimised, setDetailsMinimised] = useState(false);
  const [centerSelected, setCenterSelected] = useState(false);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  useEffect(() => setCollapsedNodeIds(new Set()), [model]);
  const collapsedView = useMemo(
    () => collapseStoryGraph(model, collapsedNodeIds),
    [collapsedNodeIds, model],
  );
  const visibleModel = collapsedView.model;
  const baseLayout = useMemo(
    () => layoutStoryGraph(visibleModel, true),
    [visibleModel],
  );
  const fitted = useTopAnchoredViewport(containerRef, baseLayout.nodes);
  const nodeById = useMemo(
    () => new Map(visibleModel.nodes.map((node) => [node.id, node])),
    [visibleModel.nodes],
  );
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
  const disclosedCandidate = selectedNodeId
    ? nodeById.get(selectedNodeId)
    : hoveredNodeId
      ? nodeById.get(hoveredNodeId)
      : undefined;
  const disclosedNode =
    disclosedCandidate?.kind === 'block' ? disclosedCandidate : undefined;
  const disclosedChildren = disclosedNode
    ? (visibleModel.childrenByNode[disclosedNode.id] ?? []).flatMap((id) => {
        const child = nodeById.get(id);
        return child?.kind === 'block' ? [child] : [];
      })
    : [];
  const disclosedConnections = disclosedNode
    ? visibleModel.edges.reduce(
        (counts, edge) => ({
          incoming: counts.incoming + Number(edge.target === disclosedNode.id),
          outgoing: counts.outgoing + Number(edge.source === disclosedNode.id),
        }),
        { incoming: 0, outgoing: 0 },
      )
    : { incoming: 0, outgoing: 0 };

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
        {disclosedNode && (
          <Panel position="top-right">
            <NodeDisclosure
              node={disclosedNode}
              children={disclosedChildren}
              incomingCount={disclosedConnections.incoming}
              outgoingCount={disclosedConnections.outgoing}
              minimised={detailsMinimised}
              onMinimisedChange={setDetailsMinimised}
            />
          </Panel>
        )}
        <Panel position="bottom-left">
          <p className="nodrag nopan rounded bg-background/90 px-2 py-1 text-[9px] text-muted-foreground shadow-sm">
            click to focus · hover connections · right-click to collapse
          </p>
        </Panel>
        <Panel position="bottom-right">
          <label
            htmlFor={centerSelectedId}
            className="nodrag nopan flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background/95 px-2.5 py-2 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur"
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
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function StoryCanvas({ story }: { readonly story: StoryArtifact }) {
  const model = useMemo(() => buildProgressiveStoryGraph(story), [story]);
  return (
    <ReactFlowProvider>
      <ProgressiveCanvasInner
        model={model}
        title={story.name}
        description={story.description}
        emptyMessage="No observed blocks in this story"
      />
    </ReactFlowProvider>
  );
}

export function ScenarioCanvas({
  story,
  scenario,
}: {
  readonly story: StoryArtifact;
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
