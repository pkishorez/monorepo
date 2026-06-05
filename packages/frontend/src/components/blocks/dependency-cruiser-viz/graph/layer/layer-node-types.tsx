import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Fragment } from 'react';

import { cn } from '#lib/utils';

import {
  LAYER_NODE_WIDTH,
  type LayerNodeData,
  type StackHeaderNodeData,
} from './layer-layout';

function StackHeaderNode({ data }: NodeProps<Node<StackHeaderNodeData>>) {
  return (
    <div
      style={{ width: LAYER_NODE_WIDTH }}
      className={cn(
        'text-center text-xs font-bold uppercase tracking-wider text-muted-foreground transition-opacity',
        data.isDimmed && 'opacity-15',
      )}
    >
      {data.label}
    </div>
  );
}

function LayerNode({ data }: NodeProps<Node<LayerNodeData>>) {
  return (
    <div
      className={cn(
        'relative transition-opacity',
        data.isDimmed ? 'cursor-default opacity-15' : 'cursor-pointer',
      )}
    >
      {data.handleOffsets ? (
        data.handleOffsets.map((h) => (
          <Fragment key={h.stackName}>
            <Handle
              type="target"
              position={Position.Top}
              id={`top-${h.stackName}`}
              style={{ left: `${h.offsetPct}%` }}
              className="!opacity-0"
            />
            <Handle
              type="source"
              position={Position.Bottom}
              id={`bottom-${h.stackName}`}
              style={{ left: `${h.offsetPct}%` }}
              className="!opacity-0"
            />
          </Fragment>
        ))
      ) : (
        <>
          <Handle
            type="target"
            position={Position.Top}
            className="!opacity-0"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            className="!opacity-0"
          />
        </>
      )}
      <div
        style={{ width: data.nodeWidth ?? LAYER_NODE_WIDTH }}
        className={cn(
          'rounded-lg px-5 py-2 text-center text-[13px] font-semibold whitespace-nowrap',
          data.isEntry
            ? 'bg-primary text-primary-foreground'
            : 'bg-card text-card-foreground',
          data.isShared
            ? 'border-2 border-dashed border-muted-foreground'
            : 'border border-border',
          data.violationCount > 0 && 'ring-2 ring-destructive/50',
          data.isSelected && 'ring-2 ring-primary',
        )}
      >
        {data.label}
      </div>
      {data.violationCount > 0 && (
        <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {data.violationCount}
        </span>
      )}
    </div>
  );
}

export const layerNodeTypes = {
  layer: LayerNode,
  stackHeader: StackHeaderNode,
};
