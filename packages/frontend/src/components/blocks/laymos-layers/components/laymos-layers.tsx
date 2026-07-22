import '@xyflow/react/dist/style.css';

import {
  Background,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type Node,
} from '@xyflow/react';
import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react';

import { Switch } from '#components/ui/switch';
import { cn } from '#lib/utils';

import { InteractionProvider } from '../context/interaction-context';
import { useFitViewOnResize } from '../hooks/use-fit-view-on-resize';
import { computeLaymosFlowLayout } from '../lib/layout';
import { buildLaymosLayersModel, getActiveModel } from '../lib/model';
import type { LaymosLayersProps, LaymosNode } from '../types';
import { ContextCard } from './context-card';
import { laymosNodeTypes } from './flow-nodes';

/** Renders a controlled, progressively disclosed view of Laymos layer graphs. */
export function LaymosLayers(props: LaymosLayersProps) {
  return (
    <ReactFlowProvider>
      <LaymosLayersInner {...props} />
    </ReactFlowProvider>
  );
}

function LaymosLayersInner({
  report,
  selectedNode,
  onSelectedNodeChange,
  hoveredNode,
  onHoveredNodeChange,
  focusedNode,
  onFocusedNodeChange,
  defaultMinimise = true,
  className,
  ariaLabel = 'Laymos layer architecture',
}: LaymosLayersProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showObservedConnections, setShowObservedConnections] = useState(true);
  const model = useMemo(() => buildLaymosLayersModel(report), [report]);
  const activeNode = selectedNode ?? hoveredNode ?? focusedNode;
  const active = useMemo(
    () => getActiveModel(model, activeNode),
    [activeNode, model],
  );
  const layout = useMemo(
    () =>
      computeLaymosFlowLayout(
        model,
        active,
        selectedNode ? hoveredNode : null,
        hoveredNode?.kind === 'graph' ? hoveredNode.name : null,
        showObservedConnections,
      ),
    [active, hoveredNode, model, selectedNode, showObservedConnections],
  );
  const fitted = useFitViewOnResize(containerRef, report.architecture);

  const toLaymosNode = useCallback((node: Node): LaymosNode | null => {
    if (node.type === 'graphHeader') {
      return { kind: 'graph', name: (node.data as { name: string }).name };
    }
    if (node.type === 'layer') {
      return { kind: 'layer', name: (node.data as { name: string }).name };
    }
    return null;
  }, []);

  const handleNodeClick = useCallback(
    (_event: MouseEvent, node: Node) => {
      const next = toLaymosNode(node);
      if (!next) return;
      const alreadySelected =
        selectedNode?.kind === next.kind && selectedNode.name === next.name;
      onSelectedNodeChange(alreadySelected ? null : next);
    },
    [onSelectedNodeChange, selectedNode, toLaymosNode],
  );

  const handleNodeMouseEnter = useCallback(
    (_event: MouseEvent, node: Node) => {
      const next = toLaymosNode(node);
      if (next) onHoveredNodeChange(next);
    },
    [onHoveredNodeChange, toLaymosNode],
  );

  if (report.architecture.graphs.length === 0) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground',
          className,
        )}
      >
        No layer graphs configured
      </div>
    );
  }

  return (
    <InteractionProvider
      selectedNode={selectedNode}
      onSelectedNodeChange={onSelectedNodeChange}
      hoveredNode={hoveredNode}
      onHoveredNodeChange={onHoveredNodeChange}
      focusedNode={focusedNode}
      onFocusedNodeChange={onFocusedNodeChange}
    >
      <div
        ref={containerRef}
        className={cn(
          'h-full w-full transition-opacity duration-150',
          fitted ? 'opacity-100' : 'opacity-0',
          className,
        )}
        aria-label={ariaLabel}
      >
        <ReactFlow
          nodes={layout.nodes}
          edges={layout.edges}
          nodeTypes={laymosNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
          onNodeClick={handleNodeClick}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={() => onHoveredNodeChange(null)}
          onPaneClick={() => onSelectedNodeChange(null)}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={20} />
          <Panel position="top-right">
            <label className="nodrag nopan flex cursor-pointer items-center justify-between gap-4 rounded-md border border-border bg-background/95 px-2.5 py-2 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur">
              Observed connections
              <Switch
                size="sm"
                checked={showObservedConnections}
                onCheckedChange={setShowObservedConnections}
                aria-label="Show observed connections"
              />
            </label>
          </Panel>
          <Panel position="bottom-right">
            <ContextCard
              model={model}
              active={active}
              defaultMinimise={defaultMinimise}
            />
          </Panel>
        </ReactFlow>
      </div>
    </InteractionProvider>
  );
}
