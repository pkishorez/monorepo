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
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  CircleMinusIcon,
  FileIcon,
  FolderOpenIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

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

const nodeTypes = {
  layer: LayerNode,
  stackHeader: StackHeaderNode,
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
    if (node.type === 'folder') {
      const folderDimmed =
        highlightedFiles && !folderContainsHighlighted(node, highlightedFiles);
      const isConfigured = configuredPaths.has(node.id);

      return (
        <Folder
          key={node.id}
          value={node.id}
          element={node.name}
          className={cn(
            isConfigured && 'font-semibold',
            !highlightedFiles && node.status === 'violation' && 'text-red-500',
            !highlightedFiles && node.status === 'orphan' && 'text-yellow-500',
            !highlightedFiles && node.status === 'covered' && 'text-foreground',
            !highlightedFiles && node.status === 'ignored' && 'opacity-40',
            folderDimmed && 'opacity-30',
          )}
        >
          {node.children
            ? renderFileTreeNodes(
                node.children,
                highlightedFiles,
                configuredPaths,
                layerOrder,
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
        fileIcon={<StatusIcon status={node.status} />}
        className={cn(
          isHighlighted && 'bg-primary/10 rounded-md font-medium',
          !highlightedFiles && node.status === 'covered' && 'text-foreground',
          !highlightedFiles && node.status === 'ignored' && 'opacity-40',
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

function collectLayerExpandedIds(layerPaths: string[]): string[] {
  const ids = new Set<string>();
  for (const p of layerPaths) {
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
  selectedLayer: string | null;
  selectedLayerPaths: string[] | null;
};

function FileTreePanel({
  config,
  summary,
  selectedLayer,
  selectedLayerPaths,
}: FileTreePanelProps) {
  const tree = useMemo(() => buildFileTree(summary), [summary]);

  const violationCount = summary.violations.length;
  const orphanCount = summary.orphanFiles.length;
  const ignoredCount = summary.ignoredFiles.length;
  const coveredCount = summary.coveredFiles.reduce(
    (sum, l) => sum + l.files.length,
    0,
  );

  const highlightedFiles = useMemo(() => {
    if (!selectedLayer) return null;
    const entry = summary.coveredFiles.find((c) => c.layer === selectedLayer);
    return entry ? new Set(entry.files) : null;
  }, [selectedLayer, summary]);

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
    return paths;
  }, [config]);

  const allLayerPaths = useMemo(() => [...configuredPaths], [configuredPaths]);

  const expandedItems = useMemo(
    () => collectLayerExpandedIds(selectedLayerPaths ?? allLayerPaths),
    [selectedLayerPaths, allLayerPaths],
  );

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-4">
        <h3 className="text-sm font-semibold">File Coverage</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {violationCount > 0 && (
            <span className="flex items-center gap-1">
              <CircleAlertIcon className="size-3 text-red-500" />
              {violationCount} violation{violationCount !== 1 ? 's' : ''}
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
        </div>
      </div>
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
      <div className="flex-1 overflow-hidden">
        <Tree
          key={selectedLayer ?? 'default'}
          elements={tree as TreeViewElement[]}
          initialExpandedItems={expandedItems}
        >
          {renderFileTreeNodes(
            tree,
            highlightedFiles,
            configuredPaths,
            layerOrder,
          )}
        </Tree>
      </div>
    </div>
  );
}

const FIT_VIEW_OPTIONS = { padding: 0.3 };

function GraphPanel({
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

  const handleResize = useCallback(() => {
    requestAnimationFrame(() => fitView(FIT_VIEW_OPTIONS));
  }, [fitView]);

  return (
    <ResizablePanel
      defaultSize={summary ? 70 : 100}
      minSize={40}
      onResize={handleResize}
    >
      <div className="h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
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
      </div>
    </ResizablePanel>
  );
}

export function DependencyCruiserViz({ visualization, summary }: Props) {
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [hoveredLayer, setHoveredLayer] = useState<string | null>(null);

  const activeLayer = selectedLayer ?? hoveredLayer;

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

  return (
    <div className="h-dvh w-full">
      <ReactFlowProvider>
        <ResizablePanelGroup orientation="horizontal">
          <GraphPanel
            config={visualization}
            summary={summary}
            activeLayer={activeLayer}
            onSelectLayer={setSelectedLayer}
            onHoverLayer={setHoveredLayer}
          />
          {summary && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={30} minSize={15}>
                <FileTreePanel
                  config={visualization}
                  summary={summary}
                  selectedLayer={activeLayer}
                  selectedLayerPaths={activeLayerPaths}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </ReactFlowProvider>
    </div>
  );
}
