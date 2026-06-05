import {
  Background,
  Handle,
  Position,
  ReactFlow,
  useReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo } from 'react';

import { cn } from '#lib/utils';

import {
  VISIBILITY_COLOR,
  type VisualizationConfig,
  type VizSummary,
} from '../../model';
import {
  computeFeatureLayout,
  type Axis3HeaderNodeData,
  type FeatureGroupNodeData,
  type FeatureNodeData,
  type ModuleNodeData,
} from './feature-graph-layout';
import { FIT_VIEW_OPTIONS } from '../react-flow-options';

type FeatureGraphPanelProps = {
  config: VisualizationConfig;
  summary?: VizSummary;
  selectedFeature: string | null;
  selectedModule: string | null;
  /** Toggles selection in the shared `selectedFeature` state. */
  onSelectFeature: (feature: string | null) => void;
  /** Toggles selection in the shared `selectedModule` state. */
  onSelectModule: (key: string | null) => void;
};

/**
 * Neutral per-feature container wrapping axis-1 (header) + axis-2 (privates).
 * Clicking anywhere on the box (its padding, not a child node) selects the
 * whole feature.
 */
function FeatureGroupNode({ data }: NodeProps<Node<FeatureGroupNodeData>>) {
  return (
    <button
      type="button"
      onClick={() => data.onSelect(data.name)}
      style={{ width: '100%', height: '100%' }}
      className={cn(
        'cursor-pointer rounded-xl border border-dashed bg-muted/30 transition-colors',
        data.isSelected
          ? 'border-primary/60'
          : 'border-border hover:border-primary/40',
        data.isDimmed && 'opacity-[0.3]',
      )}
    >
      <span className="absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {data.name}
      </span>
    </button>
  );
}

function FeatureNode({ data }: NodeProps<Node<FeatureNodeData>>) {
  return (
    <button
      type="button"
      onClick={() => data.onSelect(data.name)}
      style={{ width: '100%', height: '100%' }}
      className={cn(
        'relative flex flex-col items-start gap-1 rounded-lg border bg-card px-3 py-2 text-left shadow-sm transition-colors',
        data.isSelected
          ? 'border-primary ring-2 ring-primary/40'
          : 'border-border hover:border-primary/50',
        data.isDimmed && 'opacity-[0.18]',
      )}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <span className="text-sm font-semibold text-card-foreground">
        {data.name}
      </span>
      {data.description ? (
        <span className="line-clamp-1 text-[11px] text-muted-foreground">
          {data.description}
        </span>
      ) : null}
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
        {data.moduleCount} module{data.moduleCount === 1 ? '' : 's'} ·{' '}
        {data.fileCount} file{data.fileCount === 1 ? '' : 's'}
      </span>
    </button>
  );
}

function ModuleNode({ data }: NodeProps<Node<ModuleNodeData>>) {
  const tier = VISIBILITY_COLOR[data.visibility];
  const accent = data.isOwned || data.isConsumed || data.isSelected;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        data.onSelect(data.key);
      }}
      style={{ width: '100%', height: '100%' }}
      className={cn(
        'relative flex flex-col items-start justify-center gap-0.5 rounded-lg border bg-card px-3 py-1.5 text-left shadow-sm transition-colors',
        data.isSelected
          ? 'border-primary ring-2 ring-primary/40'
          : data.isOwned
            ? 'ring-2 ring-primary/40'
            : 'border-border hover:border-primary/50',
        data.isBreached && 'border-destructive/60',
        data.isDimmed && 'opacity-[0.18]',
      )}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <span
        aria-hidden
        className="absolute inset-y-1 left-0 w-1 rounded-full"
        style={{ backgroundColor: tier, opacity: accent ? 0.95 : 0.6 }}
      />
      <span className="pl-1.5 text-xs font-semibold text-card-foreground">
        {data.name}
      </span>
      <span className="flex items-center gap-1.5 pl-1.5">
        <span
          className="text-[9px] font-medium uppercase tracking-wider"
          style={{ color: tier }}
        >
          {data.visibility}
        </span>
        {data.fileCount > 0 ? (
          <span className="text-[9px] text-muted-foreground/80">
            · {data.fileCount} file{data.fileCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function Axis3HeaderNode({ data }: NodeProps<Node<Axis3HeaderNodeData>>) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {data.label}
    </span>
  );
}

const featureNodeTypes = {
  featureGroup: FeatureGroupNode,
  feature: FeatureNode,
  module: ModuleNode,
  axis3Header: Axis3HeaderNode,
};

const TIER_LEGEND: Array<{
  label: string;
  visibility: keyof typeof VISIBILITY_COLOR;
}> = [
  { label: 'public', visibility: 'public' },
  { label: 'shared', visibility: 'shared' },
  { label: 'private', visibility: 'private' },
];

function TierLegend() {
  return (
    <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1 rounded-md border border-border bg-card/80 px-2 py-1.5 text-[10px] shadow-sm backdrop-blur">
      {TIER_LEGEND.map((t) => (
        <span key={t.visibility} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: VISIBILITY_COLOR[t.visibility] }}
          />
          <span className="text-muted-foreground">{t.label}</span>
        </span>
      ))}
    </div>
  );
}

export function FeatureGraphPanel({
  config,
  summary,
  selectedFeature,
  selectedModule,
  onSelectFeature,
  onSelectModule,
}: FeatureGraphPanelProps) {
  const { fitView } = useReactFlow();

  const handleSelectFeature = useCallback(
    (name: string) => {
      onSelectFeature(selectedFeature === name ? null : name);
    },
    [onSelectFeature, selectedFeature],
  );

  // The reducer already toggles module selection; pass the key straight through.
  const handleSelectModule = useCallback(
    (key: string) => {
      onSelectModule(key);
    },
    [onSelectModule],
  );

  // Clicking empty canvas clears everything (select-feature(null) also clears
  // any module selection in the reducer).
  const handlePaneClick = useCallback(() => {
    onSelectFeature(null);
  }, [onSelectFeature]);

  const { nodes, edges } = useMemo(
    () =>
      computeFeatureLayout(
        config,
        summary,
        selectedFeature,
        selectedModule,
        handleSelectFeature,
        handleSelectModule,
      ),
    [
      config,
      summary,
      selectedFeature,
      selectedModule,
      handleSelectFeature,
      handleSelectModule,
    ],
  );

  // Fit when the node set changes size (not on selection, which only re-tints).
  useEffect(() => {
    requestAnimationFrame(() => fitView(FIT_VIEW_OPTIONS));
  }, [fitView, nodes.length]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={featureNodeTypes}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        nodesDraggable={false}
        nodesConnectable={false}
        onPaneClick={handlePaneClick}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--border)" gap={20} />
      </ReactFlow>
      <TierLegend />
    </div>
  );
}
