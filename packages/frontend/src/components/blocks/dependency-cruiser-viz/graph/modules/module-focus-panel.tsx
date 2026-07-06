import {
  Background,
  Handle,
  Position,
  MarkerType,
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
  useState,
} from 'react';
import { ArrowLeft } from 'lucide-react';

import { cn } from '#lib/utils';

import {
  describeRules,
  ROLE_WASH,
  type ModuleRole,
  type ModuleRules,
  type VizSummary,
} from '../../model';
import type { GraphHover } from '../../use-dependency-cruiser-viz';
import {
  BREACH_EDGE_COLOR,
  INCOMING_EDGE_COLOR,
  OUTGOING_EDGE_COLOR,
} from '../edge-colors';
import { FIT_VIEW_OPTIONS } from '../react-flow-options';
import { buildFocusGraph, type FocusNode } from './module-focus-layout';

type ModuleFocusPanelProps = {
  /** Module owning the graph — rendered centered with the selected outline. */
  selectedModule: string;
  /** Module the file tree points at — rendered with the highlight accent. */
  highlightedModule: string | null;
  summary?: VizSummary;
  opaqueKeys: ReadonlySet<string>;
  /** Declared rules per module key, for the readable rules strip. */
  rulesByKey: ReadonlyMap<string, ModuleRules>;
  roleByKey: ReadonlyMap<string, ModuleRole>;
  hoverByKey: ReadonlyMap<string, GraphHover>;
  onSelectModule: (key: string | null) => void;
  onHighlightModule: (key: string | null) => void;
  /** Previews a hovered module's files in the file tree. */
  onHoverGraphModule?: (hover: GraphHover | null) => void;
  /** Lifted above this panel so it survives grid ↔ focus round-trips. */
  transitive: boolean;
  onToggleTransitive: () => void;
};

/**
 * Inline canvas takeover for the selected module: the module centered, direct
 * consumers (incoming, sky) above and dependencies (outgoing, amber) below.
 * The transitive toggle adds dimmed outer rings both directions. Clicking a
 * node highlights it (the file tree jumps to it, the graph stays); right-click
 * re-centers the graph on it via the shared `selectModule` action.
 */
export function ModuleFocusPanel(props: ModuleFocusPanelProps) {
  return (
    <ReactFlowProvider>
      <ModuleFocusPanelInner {...props} />
    </ReactFlowProvider>
  );
}

function ModuleFocusPanelInner({
  selectedModule,
  highlightedModule,
  summary,
  opaqueKeys,
  rulesByKey,
  roleByKey,
  hoverByKey,
  onSelectModule,
  onHighlightModule,
  onHoverGraphModule,
  transitive,
  onToggleTransitive,
}: ModuleFocusPanelProps) {
  const { fitView } = useReactFlow();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // Hover always dims the graph down to the hovered node's direct
  // neighborhood; the file-tree preview stays gated — only while the
  // highlight still equals the selection (an explicit highlight wins).
  const handleHoverModule = useCallback(
    (key: string | null) => {
      setHoveredKey(key);
      if (!onHoverGraphModule) return;
      if (key && highlightedModule !== selectedModule) return;
      onHoverGraphModule(key ? (hoverByKey.get(key) ?? null) : null);
    },
    [onHoverGraphModule, highlightedModule, selectedModule, hoverByKey],
  );

  const graph = useMemo(
    () =>
      buildFocusGraph({
        center: selectedModule,
        moduleEdges: summary?.moduleEdges ?? [],
        transitive,
      }),
    [selectedModule, summary, transitive],
  );

  const hoverNeighborhood = useMemo(() => {
    if (!hoveredKey) return null;
    const nodeKeys = new Set([hoveredKey]);
    const edgeIds = new Set<string>();
    for (const e of graph.edges) {
      if (e.from !== hoveredKey && e.to !== hoveredKey) continue;
      edgeIds.add(e.id);
      nodeKeys.add(e.from);
      nodeKeys.add(e.to);
    }
    return { nodeKeys, edgeIds };
  }, [graph, hoveredKey]);

  const nodes = useMemo<Node<FocusNodeData>[]>(
    () =>
      graph.nodes.map((n) => ({
        id: n.key,
        type: 'focus-module',
        position: { x: n.x, y: n.y },
        draggable: false,
        connectable: false,
        data: {
          node: n,
          isOpaque: opaqueKeys.has(n.key),
          role: roleByKey.get(n.key) ?? 'normal',
          isHighlighted: n.key === highlightedModule,
          onSelectModule,
          onHighlightModule,
          onHoverModule: handleHoverModule,
        },
      })),
    [
      graph,
      opaqueKeys,
      roleByKey,
      highlightedModule,
      onSelectModule,
      onHighlightModule,
      handleHoverModule,
    ],
  );

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((e) => {
        const color =
          e.kind === 'breach'
            ? BREACH_EDGE_COLOR
            : e.direction === 'incoming'
              ? INCOMING_EDGE_COLOR
              : OUTGOING_EDGE_COLOR;
        const isIncident = hoverNeighborhood?.edgeIds.has(e.id) ?? false;
        return {
          id: e.id,
          source: e.from,
          target: e.to,
          animated: e.kind === 'breach',
          // `from` imports `to`; the arrowhead sits on the importer (`from`)
          // side so the edge reads "from ← to" — pointing back at who depends
          // on whom.
          markerStart: {
            type: MarkerType.ArrowClosed,
            color,
            width: 16,
            height: 16,
          },
          style: {
            stroke: color,
            strokeWidth: isIncident ? 2 : 1.5,
            opacity: isIncident
              ? 1
              : hoverNeighborhood
                ? e.opacity * 0.25
                : e.opacity,
            ...(e.kind === 'breach' ? { strokeDasharray: '6 3' } : {}),
          },
        };
      }),
    [graph, hoverNeighborhood],
  );

  // Refit only when the graph re-centers on another module; toggling
  // transitive expands in place, keeping the viewport where the user left it.
  useEffect(() => {
    const id = requestAnimationFrame(() => fitView(FIT_VIEW_OPTIONS));
    return () => cancelAnimationFrame(id);
  }, [selectedModule, fitView]);

  // Esc leaves the focus takeover and returns to the all-modules grid.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onSelectModule(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSelectModule]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 py-2 backdrop-blur">
        <button
          type="button"
          onClick={() => onSelectModule(null)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background/80 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          All modules
        </button>
        <span className="truncate text-xs font-semibold text-foreground/80">
          {selectedModule}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span
                className="h-1.5 w-3 rounded-full"
                style={{ background: INCOMING_EDGE_COLOR }}
              />
              consumed by
            </span>
            <span className="flex items-center gap-1">
              <span
                className="h-1.5 w-3 rounded-full"
                style={{ background: OUTGOING_EDGE_COLOR }}
              />
              consumes
            </span>
          </span>
          <button
            type="button"
            onClick={onToggleTransitive}
            aria-pressed={transitive}
            title={
              transitive
                ? 'Show only direct dependencies'
                : 'Also show transitive dependencies on dimmed outer rings'
            }
            className={cn(
              'rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
              transitive
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background/80 text-muted-foreground hover:text-foreground',
            )}
          >
            Transitive
          </button>
        </div>
      </div>

      <ModuleRulesStrip rules={rulesByKey.get(selectedModule)} />

      <div className="min-h-0 flex-1">
        <FocusHoverContext.Provider value={hoverNeighborhood}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={focusNodeTypes}
            fitView
            fitViewOptions={FIT_VIEW_OPTIONS}
            minZoom={0.1}
            nodesDraggable={false}
            nodesConnectable={false}
            zoomOnDoubleClick={false}
            onPaneClick={() => onSelectModule(null)}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              onToggleTransitive();
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border)" gap={20} />
          </ReactFlow>
        </FocusHoverContext.Provider>
      </div>
    </div>
  );
}

/** The selected module's declared rules, spelled out one per line. */
function ModuleRulesStrip({ rules }: { rules: ModuleRules | undefined }) {
  const lines = describeRules(rules);
  if (lines.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-background/80 px-3 py-1.5 backdrop-blur">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        Rules
      </span>
      {lines.map((line) => (
        <span
          key={line}
          className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {line}
        </span>
      ))}
    </div>
  );
}

/** Hover neighborhood lives in context, not node.data — recreating React Flow
 *  nodes on every hover causes flicker and swallows clicks. */
type FocusHoverNeighborhood = {
  nodeKeys: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
};

const FocusHoverContext = createContext<FocusHoverNeighborhood | null>(null);

type FocusNodeData = {
  node: FocusNode;
  isOpaque: boolean;
  role: ModuleRole;
  /** Whether this node is the highlighted module (file-tree pointer). */
  isHighlighted: boolean;
  onSelectModule: (key: string | null) => void;
  onHighlightModule: (key: string | null) => void;
  onHoverModule: (key: string | null) => void;
};

function FocusModuleNode({ data }: NodeProps<Node<FocusNodeData>>) {
  const {
    node,
    isOpaque,
    role,
    isHighlighted,
    onSelectModule,
    onHighlightModule,
    onHoverModule,
  } = data;
  const hoverNeighborhood = useContext(FocusHoverContext);
  const isHoverDimmed =
    hoverNeighborhood !== null && !hoverNeighborhood.nodeKeys.has(node.key);
  const isCenter = node.direction === 'center';

  return (
    <div
      className="transition-opacity"
      style={{ opacity: node.opacity * (isHoverDimmed ? 0.3 : 1) }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <button
        type="button"
        onClick={() => onHighlightModule(node.key)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isCenter) onSelectModule(node.key);
        }}
        onMouseEnter={() => onHoverModule(node.key)}
        onMouseLeave={() => onHoverModule(null)}
        title={`${node.layer} / ${node.name}${
          isOpaque ? ' · opaque' : ''
        } — click to highlight · right-click to select`}
        // Outlines don't participate in layout, so toggling the emphasis
        // never shifts the node; inline so it can't be lost to utility-class
        // merging or generation.
        style={
          isCenter
            ? { outline: '2px solid var(--primary)', outlineOffset: '-1px' }
            : isHighlighted
              ? {
                  outline: '2px solid var(--color-amber-500)',
                  outlineOffset: '-1px',
                }
              : undefined
        }
        className={cn(
          'flex max-w-56 flex-col items-start rounded-lg border px-3 py-1.5 text-left shadow-sm transition-colors',
          // The role wash always shows; selection and highlight only touch the
          // border/ring so a node's root/leaf tint survives either state.
          'border-border bg-card',
          ROLE_WASH[role],
          !isCenter && 'hover:border-primary/50',
          isCenter && 'shadow-lg',
          isOpaque && 'border-dashed',
        )}
      >
        <span
          className={cn(
            'truncate text-xs font-medium',
            isCenter ? 'text-primary' : 'text-foreground/80',
          )}
        >
          {node.name}
        </span>
        <span className="truncate text-[10px] text-muted-foreground/70">
          {node.layer}
          {isOpaque && ' · opaque'}
        </span>
      </button>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

const focusNodeTypes = { 'focus-module': FocusModuleNode };
