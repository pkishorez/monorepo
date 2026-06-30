import {
  Background,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
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

import { VISIBILITY_COLOR, type FeatureModuleGraph } from '../../model';
import { FIT_VIEW_OPTIONS } from '../react-flow-options';
import { useFitViewOnResize } from '../use-fit-view-on-resize';
import {
  BREACH_EDGE_COLOR,
  type ColumnMode,
  computeFeatureGraphLayout,
  CYCLE_EDGE_COLOR,
  LEGAL_EDGE_COLOR,
  MODULE_NODE_WIDTH,
  type ModuleGraphNodeData,
} from './feature-graph-layout';

const ACTIVE_EDGE_COLOR = 'var(--primary)';
// Edges sit calm by default so the graph reads cleanly; an active node lifts
// its own edges and fades the rest.
const IDLE_EDGE_OPACITY = 0.45;
const FADED_EDGE_OPACITY = 0.06;
const FADED_NODE_OPACITY = 0.25;

type FeatureGraphPanelProps = {
  graph: FeatureModuleGraph;
  /** `layer::name` keys the feature OWNS (vs consumes) — drives node tier. */
  ownedKeys: ReadonlySet<string>;
  /** Architecture layers in declared order — drives the swimlane columns. */
  layerOrder: readonly string[];
  /** Column-assignment rule: layer swimlanes or compact import-depth. */
  columnMode: ColumnMode;
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
  ownedKeys,
  layerOrder,
  columnMode,
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
  const { nodes, edges } = useMemo(
    () => computeFeatureGraphLayout(graph, ownedKeys, layerOrder, columnMode),
    [graph, ownedKeys, layerOrder, columnMode],
  );

  // A pin from one feature's graph is meaningless in another — drop it when the
  // graph changes.
  useEffect(() => setPinnedNode(null), [graph]);

  // A sticky selection (right-click chain pin, or left-click select) locks the
  // highlight: hover is ignored until the node is deselected. Hover only drives
  // the highlight when nothing is selected or pinned.
  const sticky = pinnedNode ?? selectedModule;
  const activeKey = sticky ?? hoveredNode;
  // The pinned node traces its full connected chain; a plain selection or hover
  // lights only direct neighbours.
  const chainMode = pinnedNode != null;
  const connectedKeys = useMemo(() => {
    if (!activeKey) return null;
    if (chainMode) return collectConnectedChain(activeKey, edges);
    const keys = new Set<string>([activeKey]);
    for (const e of edges) {
      if (e.source === activeKey) keys.add(e.target);
      if (e.target === activeKey) keys.add(e.source);
    }
    return keys;
  }, [activeKey, edges, chainMode]);

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
        const isCycle = kind === 'cycle';
        // Breach + cycle both read as "against the flow" — keep their own colour
        // and dashes even when highlighted, rather than turning primary.
        const flagged = isBreach || isCycle;
        const incident = chainMode
          ? // Whole chain: light every edge whose endpoints are both in it.
            connectedKeys != null &&
            connectedKeys.has(e.source) &&
            connectedKeys.has(e.target)
          : activeKey != null &&
            (e.source === activeKey || e.target === activeKey);
        const baseColor = isBreach
          ? BREACH_EDGE_COLOR
          : isCycle
            ? CYCLE_EDGE_COLOR
            : LEGAL_EDGE_COLOR;
        const stroke = incident && !flagged ? ACTIVE_EDGE_COLOR : baseColor;
        const opacity = !activeKey
          ? IDLE_EDGE_OPACITY
          : incident
            ? 1
            : FADED_EDGE_OPACITY;
        return {
          ...e,
          animated: flagged && (incident || !activeKey),
          style: {
            ...e.style,
            stroke,
            strokeWidth: incident ? (flagged ? 2.5 : 2) : flagged ? 2 : 1.5,
            opacity,
            transition: 'opacity 150ms, stroke 150ms',
          },
          zIndex: incident ? 1 : 0,
        };
      }),
    [edges, activeKey, chainMode, connectedKeys],
  );

  const handleNodeClick = useCallback(
    (_: MouseEvent, node: Node) => {
      onSelectModule(node.id === selectedModule ? null : node.id);
    },
    [onSelectModule, selectedModule],
  );

  // Right-click pins a node's whole connected chain; right-clicking the same
  // node (or the pane) clears it.
  const handleNodeContextMenu = useCallback((event: MouseEvent, node: Node) => {
    event.preventDefault();
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
        'h-full w-full transition-opacity duration-150',
        fitted ? 'opacity-100' : 'opacity-0',
      )}
    >
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
function collectConnectedChain(start: string, edges: Edge[]): Set<string> {
  const downstream = new Map<string, string[]>();
  const upstream = new Map<string, string[]>();
  const link = (map: Map<string, string[]>, a: string, b: string) => {
    const list = map.get(a);
    if (list) list.push(b);
    else map.set(a, [b]);
  };
  for (const e of edges) {
    link(downstream, e.source, e.target);
    link(upstream, e.target, e.source);
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

function ModuleGraphNode({ id, data }: NodeProps<Node<ModuleGraphNodeData>>) {
  const focus = useContext(GraphFocusContext);
  const { module: m, isOwned } = data;
  const isConsumed = !isOwned;
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
        title={`${m.layer} / ${m.name || '(layer root)'}${
          m.feature ? ` — ${m.feature}` : ''
        } · ${m.visibility}`}
        className={cn(
          'flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-shadow',
          'border-border bg-card text-card-foreground',
          isOwned && 'border-primary/60 bg-primary/15 text-primary',
          isConsumed &&
            'border-dashed border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-300',
          isBreached && 'ring-2 ring-inset ring-destructive/50',
          isSelected &&
            'ring-2 ring-inset ring-primary shadow-lg shadow-primary/20',
        )}
      >
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: VISIBILITY_COLOR[m.visibility] }}
          />
          <span className="truncate text-xs font-semibold">
            {m.name || '(layer root)'}
          </span>
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

const moduleGraphNodeTypes = { module: ModuleGraphNode };
