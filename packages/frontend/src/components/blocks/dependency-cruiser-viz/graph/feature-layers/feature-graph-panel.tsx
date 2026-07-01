import {
  Background,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MouseEvent } from 'react';

import { cn } from '#lib/utils';

import type { FeatureModuleGraph } from '../../model';
import { FIT_VIEW_OPTIONS } from '../react-flow-options';
import { useFitViewOnResize } from '../use-fit-view-on-resize';
import {
  BREACH_EDGE_COLOR,
  type ColumnMode,
  computeFeatureGraphLayout,
  type EdgeMode,
  type LayerBandNodeData,
  LEGAL_EDGE_COLOR,
  MODULE_NODE_WIDTH,
  type ModuleGraphNodeData,
  PEER_EDGE_COLOR,
} from './feature-graph-layout';

const ACTIVE_EDGE_COLOR = 'var(--primary)';
// Edges sit calm by default so the graph reads cleanly; an active node lifts
// its own edges and fades the rest.
const IDLE_EDGE_OPACITY = 0.45;
const FADED_EDGE_OPACITY = 0.06;
const FADED_NODE_OPACITY = 0.25;

type FeatureGraphPanelProps = {
  graph: FeatureModuleGraph;
  /** Architecture layers in declared order — drives the swimlane columns. */
  layerOrder: readonly string[];
  /** Column-assignment rule: layer swimlanes or compact import-depth. */
  columnMode: ColumnMode;
  /** Whether to transitively reduce legal edges ('reduced') or draw them all. */
  edgeMode: EdgeMode;
  selectedModule: string | null;
  onSelectModule: (key: string | null) => void;
  onHoverModule?: (key: string | null) => void;
};

/**
 * Hover/selection state for the graph, kept OUT of node/edge objects and read
 * by the node/edge renderers via context. This keeps the `nodes`/`edges` arrays
 * referentially stable across hovers, so React Flow never re-measures nodes
 * (which it does whenever a node object's identity changes) — the cause of the
 * hover flicker.
 */
type GraphFocus = {
  selectedModule: string | null;
  /** Hovered node, else the selected one — the node whose edges stay lit. */
  activeKey: string | null;
  /** `activeKey` plus its direct neighbors; null when nothing is focused. */
  connectedKeys: Set<string> | null;
};

const GraphFocusContext = createContext<GraphFocus | null>(null);

export function FeatureGraphPanel(props: FeatureGraphPanelProps) {
  return (
    <ReactFlowProvider>
      <FeatureGraphPanelInner {...props} />
    </ReactFlowProvider>
  );
}

function FeatureGraphPanelInner({
  graph,
  layerOrder,
  columnMode,
  edgeMode,
  selectedModule,
  onSelectModule,
  onHoverModule,
}: FeatureGraphPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitted = useFitViewOnResize(containerRef);
  const { fitView } = useReactFlow();

  // Switching features swaps the whole module graph; recenter so the new graph
  // fills the viewport instead of inheriting the previous feature's pan/zoom.
  // A frame's delay lets React Flow position/measure the new nodes first.
  useEffect(() => {
    const raf = requestAnimationFrame(() => void fitView(FIT_VIEW_OPTIONS));
    return () => cancelAnimationFrame(raf);
  }, [graph, columnMode, fitView]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  // Right-clicked node: highlights the WHOLE chain it belongs to (every node
  // reachable up- or downstream), not just its direct neighbours.
  const [pinnedNode, setPinnedNode] = useState<string | null>(null);

  // Stable across hovers — only recomputed when the graph itself changes, so
  // React Flow keeps the same node/edge instances and never re-measures.
  const { nodes, edges, hiddenCount } = useMemo(
    () => computeFeatureGraphLayout(graph, layerOrder, columnMode, edgeMode),
    [graph, layerOrder, columnMode, edgeMode],
  );

  // A pin from one feature's graph is meaningless in another — drop it when the
  // graph changes.
  useEffect(() => setPinnedNode(null), [graph]);

  // A sticky selection (right-click chain pin, or left-click select) locks the
  // highlight: hover is ignored until the node is deselected. Hover only drives
  // the highlight when nothing is selected or pinned.
  const sticky = pinnedNode ?? selectedModule;
  const activeKey = sticky ?? hoveredNode;
  // Right-click pins the full connected chain (both directions). A left-click
  // selection lights the downstream cone — every module the node transitively
  // imports — so selecting the root reveals the whole feature it pulls in. A
  // bare hover stays light, lighting only the node's direct neighbours.
  const chainMode = pinnedNode != null;
  const coneMode = pinnedNode == null && selectedModule != null;
  const setMode = chainMode || coneMode;
  // Reachability walks the FULL feature graph, not the rendered `edges`: the
  // layout hides family-internal edges (e.g. a `cart` barrel → its `cart/*`
  // children), so a walk over the visible edges would stop at the barrel and
  // leave its whole cone dark.
  const connectedKeys = useMemo(() => {
    if (!activeKey) return null;
    if (chainMode) return collectConnectedChain(activeKey, graph.edges);
    if (coneMode) return collectDownstream(activeKey, graph.edges);
    const keys = new Set<string>([activeKey]);
    for (const e of graph.edges) {
      if (e.from === activeKey) keys.add(e.to);
      if (e.to === activeKey) keys.add(e.from);
    }
    return keys;
  }, [activeKey, graph.edges, chainMode, coneMode]);

  const focus = useMemo<GraphFocus>(
    () => ({ selectedModule, activeKey, connectedKeys }),
    [selectedModule, activeKey, connectedKeys],
  );

  // Built-in edges can't read context, so their focus styling is applied here.
  // Re-creating edge objects on hover is fine — only NODE identity changes force
  // React Flow to re-measure (the flicker source); edges just re-render.
  const decoratedEdges = useMemo(
    () =>
      edges.map((e) => {
        const kind = (e.data as { kind?: string } | undefined)?.kind;
        const isBreach = kind === 'breach';
        // A breach reads as "against the flow" — keep its own colour and dashes
        // even when highlighted, rather than turning primary.
        const incident = setMode
          ? // Chain or cone: light every edge whose endpoints are both in it.
            connectedKeys != null &&
            connectedKeys.has(e.source) &&
            connectedKeys.has(e.target)
          : activeKey != null &&
            (e.source === activeKey || e.target === activeKey);
        const baseColor = isBreach
          ? BREACH_EDGE_COLOR
          : kind === 'peer'
            ? PEER_EDGE_COLOR
            : LEGAL_EDGE_COLOR;
        const stroke = incident && !isBreach ? ACTIVE_EDGE_COLOR : baseColor;
        const opacity = !activeKey
          ? IDLE_EDGE_OPACITY
          : incident
            ? 1
            : FADED_EDGE_OPACITY;
        return {
          ...e,
          animated: isBreach && (incident || !activeKey),
          style: {
            ...e.style,
            stroke,
            strokeWidth: incident ? (isBreach ? 2.5 : 2) : isBreach ? 2 : 1.5,
            opacity,
            transition: 'opacity 150ms, stroke 150ms',
          },
          zIndex: incident ? 1 : 0,
        };
      }),
    [edges, activeKey, setMode, connectedKeys],
  );

  const handleNodeClick = useCallback(
    (_: MouseEvent, node: Node) => {
      if (node.type !== 'module') return;
      onSelectModule(node.id === selectedModule ? null : node.id);
    },
    [onSelectModule, selectedModule],
  );

  // Right-click pins a node's whole connected chain; right-clicking the same
  // node (or the pane) clears it.
  const handleNodeContextMenu = useCallback((event: MouseEvent, node: Node) => {
    event.preventDefault();
    if (node.type !== 'module') return;
    setPinnedNode((prev) => (prev === node.id ? null : node.id));
  }, []);
  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      setPinnedNode(null);
    },
    [],
  );

  const handleNodeMouseEnter = useCallback(
    (_: MouseEvent, node: Node) => {
      if (node.type !== 'module') return;
      setHoveredNode(node.id);
      onHoverModule?.(node.id);
    },
    [onHoverModule],
  );
  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
    onHoverModule?.(null);
  }, [onHoverModule]);

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        This feature has no modules to graph.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative h-full w-full transition-opacity duration-150',
        fitted ? 'opacity-100' : 'opacity-0',
      )}
    >
      {hiddenCount > 0 && (
        <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-md border border-border bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
          {hiddenCount} {hiddenCount === 1 ? 'edge' : 'edges'} hidden
        </div>
      )}
      <GraphFocusContext.Provider value={focus}>
        <ReactFlow
          nodes={nodes}
          edges={decoratedEdges}
          nodeTypes={moduleGraphNodeTypes}
          fitView
          fitViewOptions={FIT_VIEW_OPTIONS}
          minZoom={0.1}
          nodesDraggable={false}
          nodesConnectable={false}
          zoomOnDoubleClick={false}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          onPaneClick={() => {
            onSelectModule(null);
            setPinnedNode(null);
          }}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={handleNodeMouseLeave}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={20} />
        </ReactFlow>
      </GraphFocusContext.Provider>
    </div>
  );
}

/**
 * The chain that flows THROUGH `start`, end to end: every node it transitively
 * imports (follow edges forward) plus every node that transitively imports it
 * (follow edges backward). Direction matters — an undirected walk would engulf
 * the whole graph whenever it is connected.
 */
function collectConnectedChain(
  start: string,
  edges: FeatureModuleGraph['edges'],
): Set<string> {
  const downstream = new Map<string, string[]>();
  const upstream = new Map<string, string[]>();
  const link = (map: Map<string, string[]>, a: string, b: string) => {
    const list = map.get(a);
    if (list) list.push(b);
    else map.set(a, [b]);
  };
  for (const e of edges) {
    link(downstream, e.from, e.to);
    link(upstream, e.to, e.from);
  }

  const reach = (adjacency: Map<string, string[]>, seen: Set<string>) => {
    const queue = [start];
    while (queue.length > 0) {
      const node = queue.shift()!;
      for (const next of adjacency.get(node) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  };

  const seen = new Set<string>([start]);
  reach(downstream, seen);
  reach(upstream, seen);
  return seen;
}

/**
 * The downstream cone of `start`: `start` plus every node it transitively
 * imports (follow edges forward only). Selecting a node reveals everything it
 * pulls in — for the root, the whole feature.
 */
function collectDownstream(
  start: string,
  edges: FeatureModuleGraph['edges'],
): Set<string> {
  const downstream = new Map<string, string[]>();
  for (const e of edges) {
    const list = downstream.get(e.from);
    if (list) list.push(e.to);
    else downstream.set(e.from, [e.to]);
  }
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const next of downstream.get(node) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

function ModuleGraphNode({ id, data }: NodeProps<Node<ModuleGraphNodeData>>) {
  const focus = useContext(GraphFocusContext);
  const { module: m, isShared, barrel } = data;
  const isBreached = m.breachCount > 0;
  const isSelected = focus?.selectedModule === id;
  const isDimmed = Boolean(
    focus?.connectedKeys && !focus.connectedKeys.has(id),
  );
  return (
    <div
      style={{
        width: MODULE_NODE_WIDTH,
        opacity: isDimmed ? FADED_NODE_OPACITY : 1,
      }}
      className="cursor-pointer transition-opacity duration-150"
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <div
        title={`${m.layer} / ${m.name || '(layer root)'}`}
        className={cn(
          'flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-shadow',
          'border-border bg-card text-card-foreground',
          isShared && 'border-amber-500/60 bg-amber-500/10',
          barrel && 'border-dashed',
          isBreached && 'ring-2 ring-inset ring-destructive/50',
          isSelected &&
            'ring-2 ring-inset ring-primary shadow-lg shadow-primary/20',
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold">
            {m.name || '(layer root)'}
          </span>
          {isShared && (
            <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 px-1 text-[9px] font-bold text-amber-700 dark:text-amber-300">
              S
            </span>
          )}
          {barrel && (
            <span className="ml-auto text-[9px] font-bold uppercase tracking-wider opacity-60">
              barrel
            </span>
          )}
          {isBreached && (
            <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
              {m.breachCount}
            </span>
          )}
        </div>
        <span className="truncate text-[10px] uppercase tracking-wider opacity-60">
          {m.layer}
        </span>
      </div>
    </div>
  );
}

/**
 * The highlighted swimlane region behind one layer's modules. Non-interactive
 * and painted underneath (via a low zIndex from the layout), with the layer
 * name labelled at the top-left.
 */
function LayerBandNode({ data }: NodeProps<Node<LayerBandNodeData>>) {
  return (
    <div className="relative h-full w-full rounded-xl border border-border/60 bg-muted/20">
      <span className="absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        {data.layer}
      </span>
    </div>
  );
}

const moduleGraphNodeTypes = {
  module: ModuleGraphNode,
  'layer-band': LayerBandNode,
};
