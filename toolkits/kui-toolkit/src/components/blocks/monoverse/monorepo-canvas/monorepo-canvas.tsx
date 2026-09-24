import '@xyflow/react/dist/style.css';

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import { useMemo } from 'react';
import type { DependencyKind, Package } from '../analysis';

import { Layers, TriangleAlert } from '#lib/lucide';
import { cn } from '#lib/utils';

import { ChangeBadge, changeSurfaceClass } from '../../git-changes';

import {
  edgeEmphasis,
  packageEmphasis,
  resolvePackageFocus,
  type MonorepoView,
  type PackageDecoration,
  type PackageEmphasis,
} from '../monorepo-presentation';

const nodeWidth = 200;
const nodeHeight = 44;
const siblingGap = 28;
// Rows inside one rank container.
const rowGap = 36;
// Space between two rank containers.
const rankGap = 56;
const containerPadding = 20;
const containerLabelHeight = 22;
const packagesPerRow = 5;
const stackWidth =
  packagesPerRow * nodeWidth + (packagesPerRow - 1) * siblingGap;
const containerWidth = stackWidth + containerPadding * 2;

// Selection is the loudest state on the canvas, so it is the only thing that
// glows. The border keeps its width in every state so nothing inside moves.
const selectedNodeClass =
  'border-primary bg-primary/10 ring-[3px] ring-primary/35 shadow-[0_0_28px_-4px_var(--primary)]';

export type ConnectionVisibility = 'always' | 'on-focus';

export interface PackageNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly decoration: PackageDecoration;
  readonly emphasis: PackageEmphasis;
  readonly focused: boolean;
  readonly selected: boolean;
}

export interface RankContainerNodeData extends Record<string, unknown> {
  readonly label: string;
}

export type PackageGraphNode = Node<PackageNodeData, 'package'>;
export type RankContainerGraphNode = Node<RankContainerNodeData, 'rank'>;
export type GraphNode = PackageGraphNode | RankContainerGraphNode;

interface MonorepoCanvasProps {
  readonly packages: readonly Package[];
  readonly view: MonorepoView;
  readonly selectedPackage: string | null;
  readonly hoveredPackage: string | null;
  // 'on-focus' draws no connection until a Package is hovered or selected,
  // then only that Package's connections.
  readonly connectionVisibility: ConnectionVisibility;
  readonly onHoverChange: (name: string | null) => void;
  readonly onSelect: (name: string | null) => void;
  readonly onOpenLaymos: (name: string) => void;
  // Right-click opens the Package README over the canvas.
  readonly onOpenReadme: (name: string) => void;
  // Compact screens: a double-tap selects the Package and opens the host's
  // details sheet instead of Embedded Laymos, which stays one tap away there.
  readonly onInspect?: () => void;
  readonly className?: string;
}

const nodeTypes = {
  package: PackageNode,
  rank: RankContainerNode,
} satisfies NodeTypes;

export function MonorepoCanvas(props: MonorepoCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({
  packages,
  view,
  selectedPackage,
  hoveredPackage,
  connectionVisibility,
  onHoverChange,
  onSelect,
  onOpenLaymos,
  onOpenReadme,
  onInspect,
  className,
}: MonorepoCanvasProps) {
  const focus = resolvePackageFocus({
    selectedPackage,
    hoveredPackage,
    edges: view.edges,
  });
  const layout = useMemo(() => layoutRankStack(view), [view]);
  const laymosByName = new Map(
    packages.map((pkg) => [pkg.name, pkg.hasLaymos]),
  );

  const nodes: GraphNode[] = [
    ...layout.containers.map((container): RankContainerGraphNode => ({
      id: `rank:${container.label}`,
      type: 'rank',
      position: { x: container.x, y: container.y },
      width: containerWidth,
      height: container.height,
      selectable: false,
      focusable: false,
      zIndex: -1,
      data: { label: container.label },
    })),
    ...layout.packages.map(({ name, x, y }): PackageGraphNode => ({
      id: name,
      type: 'package',
      position: { x, y },
      width: nodeWidth,
      height: nodeHeight,
      data: {
        label: name,
        decoration: view.decorations.get(name)!,
        emphasis: packageEmphasis(focus, name),
        focused: focus.focusedPackage === name,
        selected: selectedPackage === name,
      },
    })),
  ];

  const edges: Edge[] = view.edges.flatMap((edge) => {
    const emphasis = edgeEmphasis(focus, edge.id);
    if (
      connectionVisibility === 'on-focus' &&
      (emphasis === 'neutral' || emphasis === 'dimmed')
    ) {
      return [];
    }
    const emphasized = emphasis === 'emphasized';
    const color = emphasized ? 'var(--primary)' : 'var(--muted-foreground)';
    const style = edgeStyle(edge.strongestKind);
    const opacity =
      emphasis === 'dimmed'
        ? 0.08
        : emphasis === 'softened'
          ? style.opacity * 0.45
          : style.opacity;
    return [
      {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: 'default',
        style: {
          stroke: color,
          strokeWidth: emphasized
            ? style.strokeWidth + 0.75
            : style.strokeWidth,
          strokeDasharray: style.strokeDasharray,
          opacity,
          transition: 'stroke 200ms, opacity 200ms, stroke-width 200ms',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 14,
          height: 14,
        },
        zIndex: emphasized ? 1 : 0,
      },
    ];
  });

  return (
    <div
      className={cn(
        'h-96 w-full touch-none overflow-hidden bg-background',
        // Rank changes slide nodes to their new place instead of jumping.
        '[&_.react-flow__node]:transition-transform [&_.react-flow__node]:duration-300 [&_.react-flow__node]:ease-out motion-reduce:[&_.react-flow__node]:transition-none',
        className,
      )}
      aria-label="Package rank stack"
    >
      <ReactFlow<GraphNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
        minZoom={0.15}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        nodeClickDistance={4}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (node.type !== 'package') return;
          onSelect(node.id);
        }}
        onNodeDoubleClick={(event, node) => {
          event.preventDefault();
          if (node.type !== 'package') return;
          onHoverChange(null);
          if (onInspect !== undefined) {
            onSelect(node.id);
            onInspect();
            return;
          }
          if (laymosByName.get(node.id)) onOpenLaymos(node.id);
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          if (node.type !== 'package') return;
          onHoverChange(null);
          onOpenReadme(node.id);
        }}
        onNodeMouseEnter={(_, node) => {
          if (node.type === 'package') onHoverChange(node.id);
        }}
        onNodeMouseLeave={(_, node) => {
          if (node.type === 'package') onHoverChange(null);
        }}
        onPaneClick={() => {
          onHoverChange(null);
          onSelect(null);
        }}
      >
        <Background
          className="opacity-40"
          color="var(--border)"
          gap={28}
          size={1}
        />
        <Controls
          showInteractive={false}
          className="!border-border !bg-background !shadow-sm [&>button]:!border-border [&>button]:!bg-background [&>button]:!fill-foreground"
        />
      </ReactFlow>
    </div>
  );
}

function edgeStyle(kind: DependencyKind): {
  readonly strokeWidth: number;
  readonly strokeDasharray?: string;
  readonly opacity: number;
} {
  switch (kind) {
    case 'runtime':
      return { strokeWidth: 1.75, opacity: 0.9 };
    case 'peer':
      return { strokeWidth: 1.5, strokeDasharray: '7 5', opacity: 0.85 };
    case 'optional':
      return { strokeWidth: 1.5, strokeDasharray: '2 4', opacity: 0.8 };
    case 'dev':
      return { strokeWidth: 1, opacity: 0.4 };
  }
}

interface Placed {
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

interface RankContainer {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

// Every rank gets a container. Inside it, Packages wrap into rows of at most
// packagesPerRow, each row centred, so a wide rank grows down, not sideways.
// Isolated Packages get the last container.
function layoutRankStack(view: MonorepoView): {
  readonly packages: readonly Placed[];
  readonly containers: readonly RankContainer[];
} {
  const placed: Placed[] = [];
  const containers: RankContainer[] = [];
  let y = 0;

  const placeContainer = (label: string, names: readonly string[]) => {
    const rows = Math.ceil(names.length / packagesPerRow);
    const height =
      containerLabelHeight +
      containerPadding * 2 +
      rows * nodeHeight +
      (rows - 1) * rowGap;
    containers.push({ label, x: 0, y, height });
    let rowY = y + containerLabelHeight + containerPadding;
    for (let start = 0; start < names.length; start += packagesPerRow) {
      const row = names.slice(start, start + packagesPerRow);
      const rowWidth = row.length * nodeWidth + (row.length - 1) * siblingGap;
      const x0 = containerPadding + (stackWidth - rowWidth) / 2;
      row.forEach((name, index) => {
        placed.push({
          name,
          x: x0 + index * (nodeWidth + siblingGap),
          y: rowY,
        });
      });
      rowY += nodeHeight + rowGap;
    }
    y += height + rankGap;
  };

  view.rankStack.ranks.forEach((rank, index) => {
    if (rank.length > 0) placeContainer(`Level ${index}`, rank);
  });
  if (view.rankStack.isolated.length > 0) {
    placeContainer('Isolated', view.rankStack.isolated);
  }
  return { packages: placed, containers };
}

function RankContainerNode({ data }: NodeProps<RankContainerGraphNode>) {
  return (
    <div
      className="pointer-events-none h-full w-full rounded-xl border border-border/50 bg-card/15"
      aria-hidden
    >
      <span className="absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {data.label}
      </span>
    </div>
  );
}

function PackageNode({ data }: NodeProps<PackageGraphNode>) {
  const { decoration, emphasis } = data;

  return (
    <div
      className={cn(
        'h-full w-full transition-opacity duration-200',
        emphasis === 'softened' && 'opacity-55',
        emphasis === 'dimmed' && 'opacity-15',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-1 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-1 !border-0 !bg-transparent"
      />
      <div
        className={cn(
          'nodrag flex h-full w-full cursor-pointer flex-col justify-center gap-1 rounded-lg border border-border bg-card px-3 text-card-foreground shadow-sm outline-none transition-[border-color,background-color,box-shadow] duration-200',
          emphasis === 'emphasized' &&
            !data.focused &&
            'border-primary/70 bg-primary/5',
          data.focused &&
            !data.selected &&
            'border-primary ring-2 ring-primary/25',
          data.selected && selectedNodeClass,
          !data.focused &&
            !data.selected &&
            (decoration.inCycle
              ? 'border-destructive/70 ring-2 ring-destructive/20'
              : changeSurfaceClass(decoration.changeStatus)),
        )}
        title={
          decoration.hasLaymos
            ? 'Double-click to open in Laymos. Right-click for the README and files.'
            : 'Right-click for the README and files'
        }
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold">
            {data.label}
          </span>
          {decoration.inCycle && (
            <TriangleAlert
              className="size-3.5 shrink-0 text-destructive"
              aria-label="Package cycle violation"
            />
          )}
          {decoration.changeStatus !== undefined && (
            <ChangeBadge status={decoration.changeStatus} />
          )}
          {decoration.hasLaymos && (
            <Layers
              className="size-3.5 shrink-0 text-primary"
              aria-label="Laymos badge"
            />
          )}
        </div>
      </div>
    </div>
  );
}
