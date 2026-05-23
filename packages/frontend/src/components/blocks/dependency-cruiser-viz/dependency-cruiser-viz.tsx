import {
  Background,
  ReactFlow,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeProps,
  Position,
  Handle,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ChevronRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  CircleMinusIcon,
  FileIcon,
  FolderOpenIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#components/ui/collapsible';
import {
  Tree,
  Folder,
  File,
  type TreeViewElement,
} from '#components/ui/file-tree';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#components/ui/resizable';
import { cn } from '#lib/utils';

import {
  computeFeatureLayout,
  FEATURE_NODE_WIDTH,
  type FeatureHeaderNodeData,
  type FeaturePathNodeData,
} from './feature-layout';
import {
  buildFileTree,
  type FileTreeNode,
  type FileStatus,
} from './file-tree-data';
import {
  NODE_WIDTH,
  computeLayout,
  type LayerNodeData,
  type StackHeaderNodeData,
} from './layout';
import type {
  DepcruiseVizData,
  VisualizationConfig,
  VizSummary,
} from './types';

type ViewMode = 'layers' | 'features';

type Props = DepcruiseVizData;

function StackHeaderNode({ data }: NodeProps<Node<StackHeaderNodeData>>) {
  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={cn(
        'text-center text-xs font-bold uppercase tracking-wider text-muted-foreground transition-opacity',
        data.isDimmed && 'opacity-40',
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
        'relative cursor-pointer transition-opacity',
        data.isDimmed && 'opacity-40',
      )}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div
        style={{ width: NODE_WIDTH }}
        className={cn(
          'rounded-lg px-5 py-2 text-[13px] font-semibold text-center whitespace-nowrap',
          data.isEntry
            ? 'bg-primary text-primary-foreground'
            : 'bg-card text-card-foreground',
          data.isShared
            ? 'border-2 border-dashed border-muted-foreground'
            : 'border border-border',
          data.violationCount > 0 && 'ring-2 ring-red-500/50',
          data.isSelected && 'ring-2 ring-primary',
        )}
      >
        {data.label}
      </div>
      {data.violationCount > 0 && (
        <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {data.violationCount}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

function FeatureHeaderNode({ data }: NodeProps<Node<FeatureHeaderNodeData>>) {
  return (
    <div
      style={{ width: FEATURE_NODE_WIDTH }}
      className={cn(
        'relative cursor-pointer text-center text-xs font-bold uppercase tracking-wider text-muted-foreground transition-opacity',
        data.isDimmed && 'opacity-40',
        data.isSelected && 'text-primary',
      )}
    >
      {data.label}
      {data.violationCount > 0 && (
        <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
          {data.violationCount}
        </span>
      )}
    </div>
  );
}

function FeaturePathNode({ data }: NodeProps<Node<FeaturePathNodeData>>) {
  return (
    <div
      className={cn(
        'relative transition-opacity',
        data.isDimmed && 'opacity-40',
      )}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div
        style={{ width: FEATURE_NODE_WIDTH }}
        className={cn(
          'rounded-lg px-4 py-2 text-[13px] font-medium text-center whitespace-nowrap',
          'bg-card text-card-foreground',
          data.isShared
            ? 'border-2 border-dashed border-muted-foreground'
            : 'border border-border',
          data.violationCount > 0 && 'ring-2 ring-red-500/50',
          data.isSelected && 'ring-2 ring-primary',
        )}
      >
        {data.label}
      </div>
      {data.violationCount > 0 && (
        <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {data.violationCount}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

const layerNodeTypes = {
  layer: LayerNode,
  stackHeader: StackHeaderNode,
};

const featureNodeTypes = {
  featurePath: FeaturePathNode,
  featureHeader: FeatureHeaderNode,
};

const statusIcons: Record<
  FileStatus,
  { icon: typeof FileIcon; className: string }
> = {
  violation: { icon: CircleAlertIcon, className: 'text-red-500' },
  orphan: { icon: CircleHelpIcon, className: 'text-yellow-500' },
  covered: {
    icon: CircleCheckIcon,
    className: 'text-muted-foreground',
  },
  ignored: {
    icon: CircleMinusIcon,
    className: 'text-muted-foreground/40',
  },
};

function ViolationList({
  violations,
}: {
  violations: Array<{
    from: string;
    to: string;
    fromFile: string;
    toFile: string;
  }>;
}) {
  if (violations.length === 0) return null;

  return (
    <Collapsible defaultOpen={violations.length <= 5}>
      <div className="border-b border-border px-4 py-3">
        <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-xs font-semibold text-red-500">
          <ChevronRightIcon className="size-3.5 transition-transform group-data-[panel-open]:rotate-90" />
          Violations ({violations.length})
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 flex flex-col gap-1.5">
            {violations.map((v, i) => (
              <div
                key={i}
                className="flex flex-col gap-0.5 text-xs text-muted-foreground"
              >
                <span className="font-medium text-red-400">
                  {v.from} → {v.to}
                </span>
                <span className="font-mono text-[10px] opacity-70">
                  {v.fromFile} → {v.toFile}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function StatusIcon({ status }: { status?: FileStatus }) {
  if (!status) return <FileIcon className="size-4 text-muted-foreground" />;
  const cfg = statusIcons[status];
  const Icon = cfg.icon;
  return <Icon className={cn('size-4', cfg.className)} />;
}

function renderFileTreeNodes(
  nodes: FileTreeNode[],
  highlightedFiles: Set<string> | null,
  configuredPaths: Set<string>,
  layerOrder: Map<string, number>,
  statusOverrides?: Map<string, FileStatus> | null,
): React.ReactNode {
  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    const orderA = layerOrder.get(a.id);
    const orderB = layerOrder.get(b.id);
    if (orderA != null && orderB != null) return orderA - orderB;
    if (orderA != null) return -1;
    if (orderB != null) return 1;
    return a.name.localeCompare(b.name);
  });

  return sorted.map((node) => {
    const effectiveStatus = statusOverrides?.get(node.id) ?? node.status;

    if (node.type === 'folder') {
      const folderDimmed =
        highlightedFiles && !folderContainsHighlighted(node, highlightedFiles);
      const isConfigured = configuredPaths.has(node.id);
      const folderStatus =
        statusOverrides && node.children
          ? deriveFolderStatus(node.children, statusOverrides)
          : effectiveStatus;

      return (
        <Folder
          key={node.id}
          value={node.id}
          element={node.name}
          className={cn(
            isConfigured && 'font-semibold',
            !highlightedFiles && folderStatus === 'violation' && 'text-red-500',
            !highlightedFiles && folderStatus === 'orphan' && 'text-yellow-500',
            !highlightedFiles &&
              folderStatus === 'covered' &&
              'text-foreground',
            !highlightedFiles && folderStatus === 'ignored' && 'opacity-40',
            folderDimmed && 'opacity-30',
          )}
        >
          {node.children
            ? renderFileTreeNodes(
                node.children,
                highlightedFiles,
                configuredPaths,
                layerOrder,
                statusOverrides,
              )
            : null}
        </Folder>
      );
    }

    const isHighlighted = highlightedFiles?.has(node.id);
    const isDimmed = highlightedFiles && !isHighlighted;

    return (
      <File
        key={node.id}
        value={node.id}
        fileIcon={<StatusIcon status={effectiveStatus} />}
        className={cn(
          isHighlighted && 'bg-primary/10 rounded-md font-medium',
          !highlightedFiles &&
            effectiveStatus === 'covered' &&
            'text-foreground',
          !highlightedFiles && effectiveStatus === 'ignored' && 'opacity-40',
          isDimmed && 'opacity-30',
        )}
      >
        <span className="truncate">{node.name}</span>
      </File>
    );
  });
}

function folderContainsHighlighted(
  node: FileTreeNode,
  highlightedFiles: Set<string>,
): boolean {
  if (node.type === 'file') return highlightedFiles.has(node.id);
  return (
    node.children?.some((child) =>
      folderContainsHighlighted(child, highlightedFiles),
    ) ?? false
  );
}

function deriveFolderStatus(
  children: FileTreeNode[],
  overrides: Map<string, FileStatus>,
): FileStatus | undefined {
  const statuses = new Set<FileStatus>();
  for (const child of children) {
    if (child.type === 'folder' && child.children) {
      const s = deriveFolderStatus(child.children, overrides);
      if (s) statuses.add(s);
    } else {
      const s = overrides.get(child.id);
      if (s) statuses.add(s);
    }
  }
  if (statuses.has('violation')) return 'violation';
  if (statuses.has('orphan')) return 'orphan';
  if (statuses.has('covered')) return 'covered';
  if (statuses.has('ignored')) return 'ignored';
  return undefined;
}

function collectExpandedIds(paths: string[]): string[] {
  const ids = new Set<string>();
  for (const p of paths) {
    const segments = p.split('/');
    for (let i = 1; i < segments.length; i++) {
      ids.add(segments.slice(0, i).join('/'));
    }
  }
  return [...ids];
}

type FileTreePanelProps = {
  config: VisualizationConfig;
  summary: VizSummary;
  viewMode: ViewMode;
  selectedLayer: string | null;
  selectedLayerPaths: string[] | null;
  selectedFeature: string | null;
};

function FileTreePanel({
  config,
  summary,
  viewMode,
  selectedLayer,
  selectedLayerPaths,
  selectedFeature,
}: FileTreePanelProps) {
  const tree = useMemo(() => buildFileTree(summary), [summary]);

  const isFeatureView = viewMode === 'features';

  const layerViolationCount = summary.violations.length;
  const featureViolationCount = summary.featureViolations?.length ?? 0;
  const orphanCount = summary.orphanFiles.length;
  const ignoredCount = summary.ignoredFiles.length;
  const coveredCount = summary.coveredFiles.reduce(
    (sum, l) => sum + l.files.length,
    0,
  );

  const featureUncoveredCount = useMemo(() => {
    if (!summary.featureCoveredFiles) return 0;
    const featureCovered = new Set<string>();
    for (const { files } of summary.featureCoveredFiles) {
      for (const f of files) featureCovered.add(f);
    }
    const allFiles = new Set<string>();
    for (const { files } of summary.coveredFiles) {
      for (const f of files) allFiles.add(f);
    }
    for (const f of summary.orphanFiles) allFiles.add(f);
    let count = 0;
    for (const f of allFiles) {
      if (!featureCovered.has(f) && !summary.ignoredFiles.includes(f)) count++;
    }
    return count;
  }, [summary]);

  const featureCoveredCount = useMemo(() => {
    if (!summary.featureCoveredFiles) return 0;
    const covered = new Set<string>();
    for (const { files } of summary.featureCoveredFiles) {
      for (const f of files) covered.add(f);
    }
    return covered.size;
  }, [summary]);

  const selectedLayerViolations = useMemo(() => {
    if (!selectedLayer) return [];
    return summary.violations.filter(
      (v) => v.from === selectedLayer || v.to === selectedLayer,
    );
  }, [selectedLayer, summary]);

  const selectedFeatureViolations = useMemo(() => {
    if (!selectedFeature || !summary.featureViolations) return [];
    return summary.featureViolations.filter(
      (v) => v.from === selectedFeature || v.to === selectedFeature,
    );
  }, [selectedFeature, summary]);

  const selectedFeatureViolationCount = selectedFeatureViolations.length;

  const selectedFeatureCoveredCount = useMemo(() => {
    if (!selectedFeature || !summary.featureCoveredFiles) return 0;
    const entry = summary.featureCoveredFiles.find(
      (c) => c.feature === selectedFeature,
    );
    return entry?.files.length ?? 0;
  }, [selectedFeature, summary]);

  const highlightedFiles = useMemo(() => {
    if (isFeatureView) {
      if (!selectedFeature || !summary.featureCoveredFiles) return null;
      const entry = summary.featureCoveredFiles.find(
        (c) => c.feature === selectedFeature,
      );
      return entry ? new Set(entry.files) : null;
    }
    if (!selectedLayer) return null;
    const entry = summary.coveredFiles.find((c) => c.layer === selectedLayer);
    return entry ? new Set(entry.files) : null;
  }, [isFeatureView, selectedFeature, selectedLayer, summary]);

  const layerOrder = useMemo(() => {
    const order = new Map<string, number>();
    let idx = 0;
    for (const stack of config.stacks) {
      for (const layer of stack.layers) {
        for (const p of layer.paths) {
          if (!order.has(p)) order.set(p, idx++);
        }
      }
    }
    return order;
  }, [config]);

  const configuredPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const stack of config.stacks) {
      for (const layer of stack.layers) {
        for (const p of layer.paths) {
          paths.add(p);
        }
      }
    }
    if (config.features) {
      for (const feat of config.features) {
        for (const p of feat.paths) {
          paths.add(p);
        }
      }
    }
    return paths;
  }, [config]);

  const allRelevantPaths = useMemo(() => {
    if (isFeatureView && selectedFeature && config.features) {
      const feat = config.features.find((f) => f.name === selectedFeature);
      return feat?.paths ?? [...configuredPaths];
    }
    return selectedLayerPaths ?? [...configuredPaths];
  }, [
    isFeatureView,
    selectedFeature,
    selectedLayerPaths,
    config,
    configuredPaths,
  ]);

  const featureStatusOverrides = useMemo(() => {
    if (!isFeatureView) return null;
    const overrides = new Map<string, FileStatus>();

    const featureCovered = new Set<string>();
    if (summary.featureCoveredFiles) {
      for (const { files } of summary.featureCoveredFiles) {
        for (const f of files) featureCovered.add(f);
      }
    }

    const featureViolationFiles = new Set<string>();
    if (summary.featureViolations) {
      for (const v of summary.featureViolations) {
        featureViolationFiles.add(v.fromFile);
        featureViolationFiles.add(v.toFile);
      }
    }

    const allFiles = new Set<string>();
    for (const { files } of summary.coveredFiles) {
      for (const f of files) allFiles.add(f);
    }
    for (const f of summary.orphanFiles) allFiles.add(f);

    const ignoredSet = new Set(summary.ignoredFiles);

    for (const f of allFiles) {
      if (ignoredSet.has(f)) {
        overrides.set(f, 'ignored');
      } else if (featureViolationFiles.has(f)) {
        overrides.set(f, 'violation');
      } else if (featureCovered.has(f)) {
        overrides.set(f, 'covered');
      } else {
        overrides.set(f, 'orphan');
      }
    }

    return overrides;
  }, [isFeatureView, summary]);

  const expandedItems = useMemo(
    () => collectExpandedIds(allRelevantPaths),
    [allRelevantPaths],
  );

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-4">
        <h3 className="text-sm font-semibold">
          {isFeatureView
            ? selectedFeature
              ? `Feature: ${selectedFeature}`
              : 'Feature Coverage'
            : 'File Coverage'}
        </h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {isFeatureView ? (
            <>
              {(selectedFeature
                ? selectedFeatureViolationCount
                : featureViolationCount) > 0 && (
                <span className="flex items-center gap-1">
                  <CircleAlertIcon className="size-3 text-red-500" />
                  {selectedFeature
                    ? selectedFeatureViolationCount
                    : featureViolationCount}{' '}
                  violation
                  {(selectedFeature
                    ? selectedFeatureViolationCount
                    : featureViolationCount) !== 1
                    ? 's'
                    : ''}
                </span>
              )}
              <span className="flex items-center gap-1">
                <CircleHelpIcon className="size-3 text-yellow-500" />
                {featureUncoveredCount} uncovered
              </span>
              <span className="flex items-center gap-1">
                <CircleCheckIcon className="size-3 text-green-500" />
                {selectedFeature
                  ? selectedFeatureCoveredCount
                  : featureCoveredCount}{' '}
                covered
              </span>
            </>
          ) : (
            <>
              {layerViolationCount > 0 && (
                <span className="flex items-center gap-1">
                  <CircleAlertIcon className="size-3 text-red-500" />
                  {layerViolationCount} violation
                  {layerViolationCount !== 1 ? 's' : ''}
                </span>
              )}
              <span className="flex items-center gap-1">
                <CircleHelpIcon className="size-3 text-yellow-500" />
                {orphanCount} uncovered
              </span>
              <span className="flex items-center gap-1">
                <CircleCheckIcon className="size-3 text-green-500" />
                {coveredCount} covered
              </span>
              {ignoredCount > 0 && (
                <span className="flex items-center gap-1 opacity-40">
                  <CircleMinusIcon className="size-3" />
                  {ignoredCount} ignored
                </span>
              )}
            </>
          )}
        </div>
      </div>
      {!isFeatureView && (
        <div className="border-b border-border px-4 py-3">
          {selectedLayer && selectedLayerPaths ? (
            <div className="flex flex-col gap-1.5">
              <h4 className="text-xs font-semibold text-primary">
                {selectedLayer}
              </h4>
              <div className="flex flex-col gap-0.5">
                {selectedLayerPaths.map((p) => (
                  <span
                    key={p}
                    className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
                  >
                    <FolderOpenIcon className="size-3 shrink-0" />
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50">
              Hover or click a layer to see its paths
            </span>
          )}
        </div>
      )}
      {!isFeatureView && !selectedLayer && (
        <ViolationList violations={summary.violations} />
      )}
      {!isFeatureView && selectedLayer && (
        <ViolationList violations={selectedLayerViolations} />
      )}
      {isFeatureView && !selectedFeature && (
        <ViolationList violations={summary.featureViolations ?? []} />
      )}
      {isFeatureView && selectedFeature && (
        <ViolationList violations={selectedFeatureViolations} />
      )}
      {isFeatureView && !selectedFeature && (
        <div className="border-b border-border px-4 py-3">
          <span className="text-xs text-muted-foreground/50">
            Click a feature to see its files
          </span>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <Tree
          key={
            isFeatureView
              ? `feature-${selectedFeature ?? 'default'}`
              : `layer-${selectedLayer ?? 'default'}`
          }
          elements={tree as TreeViewElement[]}
          initialExpandedItems={expandedItems}
        >
          {renderFileTreeNodes(
            tree,
            highlightedFiles,
            configuredPaths,
            layerOrder,
            featureStatusOverrides,
          )}
        </Tree>
      </div>
    </div>
  );
}

const FIT_VIEW_OPTIONS = { padding: 0.3 };

function ViewToggle({
  viewMode,
  onViewModeChange,
  hasFeatures,
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  hasFeatures: boolean;
}) {
  return (
    <div className="absolute left-3 top-3 z-10 flex rounded-md border border-border bg-background/90 backdrop-blur-sm">
      <button
        onClick={() => onViewModeChange('layers')}
        className={cn(
          'px-3 py-1.5 text-xs font-medium transition-colors',
          'rounded-l-md',
          viewMode === 'layers'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Layers
      </button>
      <button
        onClick={() => hasFeatures && onViewModeChange('features')}
        disabled={!hasFeatures}
        className={cn(
          'px-3 py-1.5 text-xs font-medium transition-colors',
          'rounded-r-md border-l border-border',
          viewMode === 'features'
            ? 'bg-primary text-primary-foreground'
            : hasFeatures
              ? 'text-muted-foreground hover:text-foreground'
              : 'cursor-not-allowed text-muted-foreground/30',
        )}
      >
        Features
      </button>
    </div>
  );
}

function LayerGraphPanel({
  config,
  summary,
  activeLayer,
  onSelectLayer,
  onHoverLayer,
}: {
  config: VisualizationConfig;
  summary?: VizSummary;
  activeLayer: string | null;
  onSelectLayer: (layer: string | null) => void;
  onHoverLayer: (layer: string | null) => void;
}) {
  const { fitView } = useReactFlow();

  const { nodes, edges } = useMemo(
    () => computeLayout(config, summary, activeLayer),
    [config, summary, activeLayer],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'layer') {
        onSelectLayer(node.id);
      }
    },
    [onSelectLayer],
  );

  const handlePaneClick = useCallback(() => {
    onSelectLayer(null);
  }, [onSelectLayer]);

  const handleNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'layer') {
        onHoverLayer(node.id);
      }
    },
    [onHoverLayer],
  );

  const handleNodeMouseLeave = useCallback(() => {
    onHoverLayer(null);
  }, [onHoverLayer]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={layerNodeTypes}
      fitView
      fitViewOptions={FIT_VIEW_OPTIONS}
      nodesDraggable={false}
      nodesConnectable={false}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      onNodeMouseEnter={handleNodeMouseEnter}
      onNodeMouseLeave={handleNodeMouseLeave}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="hsl(var(--border))" gap={20} />
    </ReactFlow>
  );
}

function FeatureGraphPanel({
  config,
  summary,
  activeFeature,
  onSelectFeature,
  onHoverFeature,
}: {
  config: VisualizationConfig;
  summary?: VizSummary;
  activeFeature: string | null;
  onSelectFeature: (feature: string | null) => void;
  onHoverFeature: (feature: string | null) => void;
}) {
  const { nodes, edges } = useMemo(
    () => computeFeatureLayout(config, summary, activeFeature),
    [config, summary, activeFeature],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'featureHeader') {
        const featureName = node.id.replace('feature-header-', '');
        onSelectFeature(featureName);
      }
    },
    [onSelectFeature],
  );

  const handlePaneClick = useCallback(() => {
    onSelectFeature(null);
  }, [onSelectFeature]);

  const handleNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'featureHeader') {
        const featureName = node.id.replace('feature-header-', '');
        onHoverFeature(featureName);
      }
    },
    [onHoverFeature],
  );

  const handleNodeMouseLeave = useCallback(() => {
    onHoverFeature(null);
  }, [onHoverFeature]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={featureNodeTypes}
      fitView
      fitViewOptions={FIT_VIEW_OPTIONS}
      nodesDraggable={false}
      nodesConnectable={false}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      onNodeMouseEnter={handleNodeMouseEnter}
      onNodeMouseLeave={handleNodeMouseLeave}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="hsl(var(--border))" gap={20} />
    </ReactFlow>
  );
}

function GraphPanel({
  config,
  summary,
  viewMode,
  onViewModeChange,
  activeLayer,
  onSelectLayer,
  onHoverLayer,
  activeFeature,
  onSelectFeature,
  onHoverFeature,
}: {
  config: VisualizationConfig;
  summary?: VizSummary;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  activeLayer: string | null;
  onSelectLayer: (layer: string | null) => void;
  onHoverLayer: (layer: string | null) => void;
  activeFeature: string | null;
  onSelectFeature: (feature: string | null) => void;
  onHoverFeature: (feature: string | null) => void;
}) {
  const { fitView } = useReactFlow();

  const hasFeatures = (config.features ?? []).length > 0;

  const handleResize = useCallback(() => {
    requestAnimationFrame(() => fitView(FIT_VIEW_OPTIONS));
  }, [fitView]);

  return (
    <ResizablePanel
      defaultSize={summary ? 70 : 100}
      minSize={40}
      onResize={handleResize}
    >
      <div className="relative h-full w-full">
        <ViewToggle
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          hasFeatures={hasFeatures}
        />
        {viewMode === 'layers' ? (
          <LayerGraphPanel
            config={config}
            summary={summary}
            activeLayer={activeLayer}
            onSelectLayer={onSelectLayer}
            onHoverLayer={onHoverLayer}
          />
        ) : (
          <FeatureGraphPanel
            config={config}
            summary={summary}
            activeFeature={activeFeature}
            onSelectFeature={onSelectFeature}
            onHoverFeature={onHoverFeature}
          />
        )}
      </div>
    </ResizablePanel>
  );
}

export function DependencyCruiserViz({ visualization, summary }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('layers');
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [hoveredLayer, setHoveredLayer] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null);

  const activeLayer = selectedLayer ?? hoveredLayer;
  const activeFeature = selectedFeature ?? hoveredFeature;

  const activeLayerPaths = useMemo(() => {
    if (!activeLayer) return null;
    const paths: string[] = [];
    for (const stack of visualization.stacks) {
      for (const layer of stack.layers) {
        if (layer.name === activeLayer) {
          for (const p of layer.paths) {
            if (!paths.includes(p)) paths.push(p);
          }
        }
      }
    }
    return paths.length > 0 ? paths : null;
  }, [activeLayer, visualization]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setSelectedLayer(null);
    setHoveredLayer(null);
    setSelectedFeature(null);
    setHoveredFeature(null);
  }, []);

  return (
    <div className="h-dvh w-full">
      <ReactFlowProvider>
        <ResizablePanelGroup orientation="horizontal">
          <GraphPanel
            config={visualization}
            summary={summary}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            activeLayer={activeLayer}
            onSelectLayer={setSelectedLayer}
            onHoverLayer={setHoveredLayer}
            activeFeature={activeFeature}
            onSelectFeature={setSelectedFeature}
            onHoverFeature={setHoveredFeature}
          />
          {summary && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={30} minSize={15}>
                <FileTreePanel
                  config={visualization}
                  summary={summary}
                  viewMode={viewMode}
                  selectedLayer={activeLayer}
                  selectedLayerPaths={activeLayerPaths}
                  selectedFeature={activeFeature}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </ReactFlowProvider>
    </div>
  );
}
