import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { FolderClosed, FolderOpen } from 'lucide-react';

import { cn } from '#lib/utils';

import type { FeatureNodeData } from './feature-layout';

function FeatureSeedNode({ data }: NodeProps<Node<FeatureNodeData>>) {
  return (
    <div
      className={cn(
        'relative transition-opacity',
        data.isDimmed ? 'opacity-15' : '',
      )}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <div className="rounded-lg border border-primary bg-primary px-4 py-2 text-center text-[13px] font-semibold text-primary-foreground whitespace-nowrap">
        {data.label}
      </div>
    </div>
  );
}

function FeatureFileNode({ data }: NodeProps<Node<FeatureNodeData>>) {
  return (
    <div
      className={cn(
        'relative transition-opacity',
        data.isDimmed ? 'opacity-15' : '',
      )}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <div className="rounded-lg border border-border bg-card px-4 py-2 text-center text-[13px] font-semibold text-card-foreground whitespace-nowrap">
        {data.label}
      </div>
    </div>
  );
}

function FeatureFolderNode({ data }: NodeProps<Node<FeatureNodeData>>) {
  const fileCount = data.files?.length ?? 0;
  const Icon = data.isExpanded ? FolderOpen : FolderClosed;
  return (
    <div
      className={cn(
        'relative cursor-pointer transition-opacity',
        data.isDimmed ? 'opacity-15' : '',
      )}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-4 py-2 text-[13px] font-semibold text-muted-foreground whitespace-nowrap">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {data.label}
      </div>
      {fileCount > 0 && !data.isExpanded && (
        <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-muted-foreground px-1 text-[10px] font-bold text-background">
          {fileCount}
        </span>
      )}
    </div>
  );
}

export const featureNodeTypes = {
  'feature-seed': FeatureSeedNode,
  'feature-file': FeatureFileNode,
  'feature-folder': FeatureFolderNode,
};
