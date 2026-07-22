import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

import { cn } from '#lib/utils';

import { useNodeInteractions } from '../context/interaction-context';
import { layerColors } from '../lib/colors';

const CORNER_OFFSET = 14;

function DirectionalHandles() {
  const topAndBottom = [
    { suffix: 'left', offset: CORNER_OFFSET },
    { suffix: '', offset: '50%' },
    { suffix: 'right', offset: `calc(100% - ${CORNER_OFFSET}px)` },
  ] as const;

  return (
    <>
      {(['target', 'source'] as const).flatMap((type) =>
        ([Position.Top, Position.Bottom] as const).flatMap((position) =>
          topAndBottom.map(({ suffix, offset }) => {
            const side = position === Position.Top ? 'top' : 'bottom';
            return (
              <Handle
                key={`${type}-${side}-${suffix || 'center'}`}
                id={`${type}-${side}${suffix ? `-${suffix}` : ''}`}
                type={type}
                position={position}
                style={{ left: offset }}
                className="!opacity-0"
              />
            );
          }),
        ),
      )}
      {(['target', 'source'] as const).flatMap((type) =>
        ([Position.Left, Position.Right] as const).map((position) => {
          const side = position === Position.Left ? 'left' : 'right';
          return (
            <Handle
              key={`${type}-${side}`}
              id={`${type}-${side}`}
              type={type}
              position={position}
              className="!opacity-0"
            />
          );
        }),
      )}
    </>
  );
}

export type LaneNodeData = {
  label: string;
  highlighted: boolean;
  dimmed: boolean;
};

export type GraphHeaderNodeData = {
  name: string;
  description?: string;
  fileCount: number;
  moduleCoveredFiles: number;
  moduleTotalFiles: number;
  violationCount: number;
  dimmed: boolean;
};

export type LayerNodeData = {
  name: string;
  fileCount: number;
  moduleCoveredFiles: number;
  moduleTotalFiles: number;
  violationCount: number;
  related: boolean;
  dimmed: boolean;
  targetHandles: readonly { id: string; offset: number }[];
};

function LaneNode({ data }: NodeProps<Node<LaneNodeData>>) {
  return (
    <div
      className={cn(
        'h-full w-full rounded-xl border border-transparent bg-transparent transition-all duration-150',
        data.highlighted && 'border-border/50 bg-muted/20',
        data.dimmed && 'opacity-40',
      )}
      aria-hidden
    />
  );
}

function GraphHeaderNode({ data }: NodeProps<Node<GraphHeaderNodeData>>) {
  const node = { kind: 'graph' as const, name: data.name };
  const interaction = useNodeInteractions(node);
  const uncoveredFiles = Math.max(
    0,
    data.moduleTotalFiles - data.moduleCoveredFiles,
  );
  const events = {
    onFocus: interaction.onFocus,
    onBlur: interaction.onBlur,
    onKeyDown: interaction.onKeyDown,
  };
  return (
    <div className="relative h-full w-full">
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        className="!opacity-0"
      />
      <button
        type="button"
        className={cn(
          'nodrag nopan flex h-full w-full flex-col justify-center rounded-md border border-border bg-background/95 px-3 py-2 text-muted-foreground shadow-sm transition-all',
          data.dimmed && 'opacity-25',
          interaction.hovered && 'ring-2 ring-primary/30',
          interaction.focused && 'outline-2 outline-ring outline-offset-2',
          interaction.selected &&
            'border-primary text-foreground ring-2 ring-primary/40',
        )}
        aria-label={`${data.name} graph, ${data.fileCount} files, ${uncoveredFiles} uncovered, ${data.violationCount} layer errors`}
        {...events}
      >
        <span className="pointer-events-none text-xs font-bold uppercase tracking-wider">
          {data.name}
        </span>
        <span className="pointer-events-none flex gap-1 text-[10px] tabular-nums text-muted-foreground">
          {data.fileCount} {data.fileCount === 1 ? 'file' : 'files'}
          {uncoveredFiles > 0 && (
            <>
              <span aria-hidden>·</span>
              <span
                className="opacity-80"
                style={{ color: layerColors.coverageGap }}
              >
                {uncoveredFiles} uncovered
              </span>
            </>
          )}
          {data.violationCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="text-destructive">
                {data.violationCount}{' '}
                {data.violationCount === 1 ? 'error' : 'errors'}
              </span>
            </>
          )}
        </span>
      </button>
    </div>
  );
}

function coveragePercent(covered: number, total: number): number {
  return total === 0 ? 0 : Math.round((covered / total) * 100);
}

function LayerNode({ data }: NodeProps<Node<LayerNodeData>>) {
  const node = { kind: 'layer' as const, name: data.name };
  const interaction = useNodeInteractions(node);
  const events = {
    onFocus: interaction.onFocus,
    onBlur: interaction.onBlur,
    onKeyDown: interaction.onKeyDown,
  };
  const coverage = coveragePercent(
    data.moduleCoveredFiles,
    data.moduleTotalFiles,
  );
  const uncoveredFiles = Math.max(
    0,
    data.moduleTotalFiles - data.moduleCoveredFiles,
  );
  const highlighted =
    interaction.hovered || interaction.focused || interaction.selected;
  return (
    <div
      className={cn(
        'relative h-full w-full transition-opacity',
        data.dimmed && 'opacity-20',
      )}
    >
      <DirectionalHandles />
      {data.targetHandles.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="target"
          position={Position.Top}
          style={{ left: `${handle.offset}%` }}
          className="!opacity-0"
        />
      ))}
      <button
        type="button"
        className={cn(
          'nodrag nopan relative flex h-full w-full flex-col justify-center rounded-lg border border-border bg-card px-4 text-left text-card-foreground shadow-sm transition-all',
          highlighted && 'border-primary ring-2 ring-primary/40 shadow-md',
        )}
        aria-label={`${data.name} layer, ${data.fileCount} files, ${coverage}% module coverage${data.violationCount > 0 ? `, ${data.violationCount} layer violations` : ''}`}
        {...events}
      >
        <span className="pointer-events-none truncate text-sm font-semibold">
          {data.name}
        </span>
        <span className="pointer-events-none flex gap-1 text-[10px] tabular-nums text-muted-foreground">
          {data.fileCount} {data.fileCount === 1 ? 'file' : 'files'}
          {uncoveredFiles > 0 && (
            <>
              <span aria-hidden>·</span>
              <span
                className="opacity-80"
                style={{ color: layerColors.coverageGap }}
              >
                {uncoveredFiles} uncovered
              </span>
            </>
          )}
          {data.violationCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="text-destructive">
                {data.violationCount}{' '}
                {data.violationCount === 1 ? 'error' : 'errors'}
              </span>
            </>
          )}
        </span>
      </button>
    </div>
  );
}

export const laymosNodeTypes = {
  lane: LaneNode,
  graphHeader: GraphHeaderNode,
  layer: LayerNode,
};
