import {
  memo,
  useId,
  useMemo,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import { cn } from '#lib/utils';

import { createSelectionTargets } from '../lib/focus';
import {
  DIAGRAM_PADDING,
  EDGE_LABEL_HEIGHT,
  EDGE_LABEL_MINIMUM_WIDTH,
  getFitViewport,
} from '../lib/metrics';
import { roundedOrthogonalPath } from '../lib/rounded-orthogonal-path';
import type {
  StateMachineSceneEdge,
  StateMachineSceneNode,
  StateMachineHighlight,
  StateMachineClassNames,
  StateMachineNodeRole,
  StateMachineSvgProps,
} from '../types';
import { InitialNode, StateNode } from './state-nodes';

const IDLE_HIGHLIGHT: StateMachineHighlight = { kind: 'idle' };

export function StateMachineSvg({
  diagram,
  className,
  classNames,
  padding = DIAGRAM_PADDING,
  viewport,
  svgProps,
  nodeHighlights,
  edgeHighlights,
  onNodeSelect,
  onConnectedNodeHover,
  onClearFocus,
}: StateMachineSvgProps) {
  const markerId = `${useId().replaceAll(':', '')}-arrow`;
  const scene = useMemo(() => {
    const containers: StateMachineSceneNode[] = [];
    const foreground: StateMachineSceneNode[] = [];

    for (const node of diagram.nodes) {
      if (node.container) containers.push(node);
      else foreground.push(node);
    }

    return {
      containers,
      foreground,
      selectionTargets: createSelectionTargets(diagram),
      labelledEdges: diagram.edges.filter(
        (edge) =>
          edge.label && edge.labelX !== undefined && edge.labelY !== undefined,
      ),
    };
  }, [diagram]);
  const viewBox = viewport ?? getFitViewport(diagram, padding);

  return (
    <svg
      {...svgProps}
      onClick={(event) => {
        svgProps?.onClick?.(event);
        if (!event.defaultPrevented) onClearFocus?.();
      }}
      className={cn('block h-full w-full', className)}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      preserveAspectRatio="xMidYMid meet"
      role={onNodeSelect ? 'group' : 'img'}
      aria-label={`${diagram.label} state machine`}
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>
      {scene.containers.map((node) => (
        <SvgNode
          key={node.id}
          node={node}
          selectionTarget={scene.selectionTargets.get(node.id)}
          highlight={nodeHighlights?.get(node.id) ?? IDLE_HIGHLIGHT}
          classNames={classNames}
          onSelect={onNodeSelect}
          onConnectedHover={onConnectedNodeHover}
        />
      ))}
      {diagram.edges.map((edge) => (
        <SvgEdge
          key={edge.id}
          edge={edge}
          highlight={edgeHighlights?.get(edge.id) ?? IDLE_HIGHLIGHT}
          markerId={markerId}
          classNames={classNames}
        />
      ))}
      {scene.foreground.map((node) => (
        <SvgNode
          key={node.id}
          node={node}
          selectionTarget={scene.selectionTargets.get(node.id)}
          highlight={nodeHighlights?.get(node.id) ?? IDLE_HIGHLIGHT}
          classNames={classNames}
          onSelect={onNodeSelect}
          onConnectedHover={onConnectedNodeHover}
        />
      ))}
      {scene.labelledEdges.map((edge) => (
        <SvgEdgeLabel
          key={edge.id}
          edge={edge}
          highlight={edgeHighlights?.get(edge.id) ?? IDLE_HIGHLIGHT}
          classNames={classNames}
        />
      ))}
    </svg>
  );
}

const SvgNode = memo(function SvgNode({
  node,
  selectionTarget,
  highlight,
  classNames,
  onSelect,
  onConnectedHover,
}: {
  readonly node: StateMachineSceneNode;
  readonly selectionTarget?: StateMachineSceneNode;
  readonly highlight: StateMachineHighlight;
  readonly classNames?: StateMachineClassNames;
  readonly onSelect?: (node: StateMachineSceneNode) => void;
  readonly onConnectedHover?: (nodeId: string | undefined) => void;
}) {
  const selectable = selectionTarget !== undefined && onSelect !== undefined;
  const className = cn(
    HIGHLIGHT_CLASS_NAMES[highlight.kind].node,
    classNames?.node?.({
      role: getNodeRole(node),
      node,
      highlight,
    }),
  );

  function select(event: MouseEvent<SVGForeignObjectElement>) {
    if (!selectable) return;
    event.stopPropagation();
    onSelect(selectionTarget);
  }

  function selectWithKeyboard(event: KeyboardEvent<SVGForeignObjectElement>) {
    if (!selectable || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(selectionTarget);
  }

  return (
    <foreignObject
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      className={cn(
        'overflow-visible',
        selectable &&
          'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      )}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      aria-label={
        selectable ? `Focus ${selectionTarget.label} state` : undefined
      }
      onClick={select}
      onKeyDown={selectWithKeyboard}
      onMouseEnter={() => {
        if (highlight.kind === 'connected') onConnectedHover?.(node.id);
      }}
      onMouseLeave={() => {
        if (highlight.kind === 'connected') onConnectedHover?.(undefined);
      }}
    >
      {node.kind === 'initial' ? (
        <InitialNode className={className} />
      ) : (
        <StateNode node={node} className={className} />
      )}
    </foreignObject>
  );
});

const SvgEdge = memo(function SvgEdge({
  edge,
  highlight,
  markerId,
  classNames,
}: {
  readonly edge: StateMachineSceneEdge;
  readonly highlight: StateMachineHighlight;
  readonly markerId: string;
  readonly classNames?: StateMachineClassNames;
}) {
  const className = cn(
    HIGHLIGHT_CLASS_NAMES[highlight.kind].edge,
    classNames?.edge?.({
      role: edge.initial ? 'initial-arrow' : 'transition',
      edge,
      highlight,
    }),
  );
  const paths = useMemo(
    () =>
      edge.sections.map((section) => ({
        d: roundedOrthogonalPath(section.points),
        target: section.target,
      })),
    [edge.sections],
  );
  return (
    <g>
      {paths.map((path, index) => (
        <path
          key={`${edge.id}:${index}`}
          d={path.d}
          fill="none"
          stroke={
            edge.initial ? 'var(--foreground)' : 'var(--muted-foreground)'
          }
          strokeWidth={edge.initial ? 2 : 1.25}
          opacity={edge.initial ? 1 : 0.72}
          markerEnd={path.target ? `url(#${markerId})` : undefined}
          className={className}
        />
      ))}
    </g>
  );
});

const SvgEdgeLabel = memo(function SvgEdgeLabel({
  edge,
  highlight,
  classNames,
}: {
  readonly edge: StateMachineSceneEdge;
  readonly highlight: StateMachineHighlight;
  readonly classNames?: StateMachineClassNames;
}) {
  if (!edge.label || edge.labelX === undefined || edge.labelY === undefined) {
    return null;
  }

  const width = edge.labelWidth ?? EDGE_LABEL_MINIMUM_WIDTH;
  const height = edge.labelHeight ?? EDGE_LABEL_HEIGHT;

  return (
    <foreignObject
      x={edge.labelX - width / 2}
      y={edge.labelY - height / 2}
      width={width}
      height={height}
      className="overflow-visible"
    >
      <div
        className={cn(
          'pointer-events-none flex h-full w-full items-center justify-center rounded-md border border-border bg-card px-2 py-1 text-center text-[10px] font-medium leading-3 text-card-foreground shadow-sm transition-[color,background-color,border-color,opacity] duration-200',
          HIGHLIGHT_CLASS_NAMES[highlight.kind].label,
          classNames?.edge?.({
            role: edge.initial ? 'initial-arrow' : 'transition',
            edge,
            highlight,
          }),
        )}
        style={{
          overflowWrap: 'anywhere',
          whiteSpace: height > EDGE_LABEL_HEIGHT ? 'normal' : 'nowrap',
        }}
      >
        {edge.label}
      </div>
    </foreignObject>
  );
});

function getNodeRole(node: StateMachineSceneNode): StateMachineNodeRole {
  if (node.kind === 'initial') return 'initial-indicator';
  if (node.initial) return 'initial';
  if (node.type === 'final') return 'final';
  if (node.type === 'choice') return 'choice';
  return 'intermediate';
}

const HIGHLIGHT_CLASS_NAMES: Record<
  StateMachineHighlight['kind'],
  { readonly node: string; readonly edge: string; readonly label: string }
> = {
  focused: {
    node: 'border-primary opacity-100 outline-2 outline-offset-2 outline-primary shadow-[0_0_12px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-[border-color,box-shadow,opacity,outline-color] duration-200',
    edge: 'stroke-primary opacity-100 transition-[stroke,opacity] duration-200',
    label: 'border-primary bg-card text-primary opacity-100',
  },
  dimmed: {
    node: 'opacity-20 transition-opacity duration-200',
    edge: 'opacity-15 transition-opacity duration-200',
    label: 'border-border bg-card text-muted-foreground/20 shadow-none',
  },
  connected: {
    node: 'opacity-100 transition-opacity duration-200',
    edge: 'stroke-emerald-500 opacity-100 transition-[stroke,opacity] duration-200',
    label:
      'border-emerald-500/60 bg-card text-emerald-700 opacity-100 dark:text-emerald-300',
  },
  idle: {
    node: 'transition-opacity duration-200',
    edge: 'transition-[stroke,opacity] duration-200',
    label: '',
  },
};
