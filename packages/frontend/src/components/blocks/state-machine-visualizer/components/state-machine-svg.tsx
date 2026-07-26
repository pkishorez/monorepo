import { memo, useId, useMemo } from 'react';

import { cn } from '#lib/utils';

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
  StateMachineSvgClassNames,
  StateMachineSvgNodeRole,
  StateMachineSvgProps,
} from '../types';
import { InitialNode, StateNode } from './state-nodes';

export function StateMachineSvg({
  layout,
  className,
  classNames,
  ariaLabel = 'State machine',
  padding = DIAGRAM_PADDING,
  viewport,
  svgProps,
}: StateMachineSvgProps) {
  const markerId = `${useId().replaceAll(':', '')}-arrow`;
  const scene = useMemo(
    () => ({
      containers: layout.nodes.filter((node) => node.container),
      foreground: layout.nodes.filter((node) => !node.container),
    }),
    [layout.nodes],
  );
  const viewBox = viewport ?? getFitViewport(layout, padding);

  return (
    <svg
      {...svgProps}
      className={cn('block h-full w-full', className)}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
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
        <SvgNode key={node.id} node={node} classNames={classNames} />
      ))}
      {layout.edges.map((edge) => (
        <SvgEdge
          key={edge.id}
          edge={edge}
          markerId={markerId}
          classNames={classNames}
        />
      ))}
      {scene.foreground.map((node) => (
        <SvgNode key={node.id} node={node} classNames={classNames} />
      ))}
    </svg>
  );
}

const SvgNode = memo(function SvgNode({
  node,
  classNames,
}: {
  readonly node: StateMachineSceneNode;
  readonly classNames?: StateMachineSvgClassNames;
}) {
  const className = classNames?.node?.({
    role: getNodeRole(node),
    node,
  });

  return (
    <foreignObject
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      className="overflow-visible"
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
  markerId,
  classNames,
}: {
  readonly edge: StateMachineSceneEdge;
  readonly markerId: string;
  readonly classNames?: StateMachineSvgClassNames;
}) {
  const className = classNames?.edge?.({
    role: edge.initial ? 'initial-arrow' : 'transition',
    edge,
  });
  const paths = useMemo(
    () =>
      edge.sections.map((section) => ({
        d: roundedOrthogonalPath(section.points),
        target: section.target,
      })),
    [edge.sections],
  );
  const labelWidth = edge.labelWidth ?? EDGE_LABEL_MINIMUM_WIDTH;
  const labelHeight = edge.labelHeight ?? EDGE_LABEL_HEIGHT;
  const labelWrapped = labelHeight > EDGE_LABEL_HEIGHT;

  return (
    <g>
      {paths.map((path, index) => (
        <path
          key={`${edge.id}:${index}`}
          d={path.d}
          fill="none"
          stroke={edge.initial ? 'var(--primary)' : 'var(--muted-foreground)'}
          strokeWidth={edge.initial ? 1.75 : 1.25}
          opacity={edge.initial ? 1 : 0.72}
          markerEnd={path.target ? `url(#${markerId})` : undefined}
          className={className}
        />
      ))}
      {edge.label && edge.labelX !== undefined && edge.labelY !== undefined && (
        <foreignObject
          x={edge.labelX - labelWidth / 2}
          y={edge.labelY - labelHeight / 2}
          width={labelWidth}
          height={labelHeight}
          className="overflow-visible"
        >
          <div
            className="pointer-events-none flex h-full w-full items-center justify-center rounded-md border border-border bg-card px-2 py-1 text-center text-[10px] font-medium leading-3 text-card-foreground shadow-sm"
            style={{
              overflowWrap: 'anywhere',
              whiteSpace: labelWrapped ? 'normal' : 'nowrap',
            }}
          >
            {edge.label}
          </div>
        </foreignObject>
      )}
    </g>
  );
});

function getNodeRole(node: StateMachineSceneNode): StateMachineSvgNodeRole {
  if (node.kind === 'initial') return 'initial-indicator';
  if (node.initial) return 'initial';
  if (node.type === 'final') return 'final';
  return 'intermediate';
}
