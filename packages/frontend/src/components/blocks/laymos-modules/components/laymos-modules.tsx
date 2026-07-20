import '@xyflow/react/dist/style.css';

import {
  Background,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type Node,
} from '@xyflow/react';
import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react';

import { cn } from '#lib/utils';

import { useFitViewOnResize } from '../hooks/use-fit-view-on-resize';
import { moduleColors } from '../lib/colors';
import {
  canHoverModule,
  getModuleGraphActiveModel,
} from '../lib/graph-connectivity';
import { computeModuleGraphLayout } from '../lib/layout';
import { buildLaymosModulesModel } from '../lib/model';
import type { LaymosModulesProps } from '../types';
import {
  moduleGraphNodeTypes,
  ModuleGraphInteractionContext,
} from './flow-nodes';

/** Renders Laymos modules as one compact, topology-first dependency DAG. */
export function LaymosModules(props: LaymosModulesProps) {
  return (
    <ReactFlowProvider>
      <LaymosModulesInner {...props} />
    </ReactFlowProvider>
  );
}

function LaymosModulesInner({
  report,
  selectedModule,
  onSelectedModuleChange,
  hoveredModule,
  onHoveredModuleChange,
  focusedModule,
  onFocusedModuleChange,
  className,
  ariaLabel = 'Laymos unified module dependency graph',
}: LaymosModulesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedClusters, setExpandedClusters] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const model = useMemo(() => buildLaymosModulesModel(report), [report]);
  const selectionActive = useMemo(
    () => getModuleGraphActiveModel(model, selectedModule, null),
    [model, selectedModule],
  );
  const eligibleHoveredModule =
    hoveredModule &&
    canHoverModule(selectionActive, selectedModule, hoveredModule)
      ? hoveredModule
      : null;
  const active = useMemo(
    () =>
      getModuleGraphActiveModel(model, selectedModule, eligibleHoveredModule),
    [eligibleHoveredModule, model, selectedModule],
  );
  const layout = useMemo(
    () => computeModuleGraphLayout(model, active, expandedClusters),
    [active, expandedClusters, model],
  );
  const fitted = useFitViewOnResize(containerRef, report.architecture);

  const modulePath = useCallback((node: Node): string | null => {
    return node.type === 'module-graph'
      ? (node.data as { path: string }).path
      : null;
  }, []);
  const onNodeClick = useCallback(
    (_event: MouseEvent, node: Node) => {
      const path = modulePath(node);
      if (!path) return;
      onSelectedModuleChange(
        selectedModule?.path === path && selectedModule.depth === 'direct'
          ? null
          : { path, depth: 'direct' },
      );
    },
    [modulePath, onSelectedModuleChange, selectedModule],
  );
  const onNodeContextMenu = useCallback(
    (event: MouseEvent, node: Node) => {
      const path = modulePath(node);
      if (!path) return;
      event.preventDefault();
      onSelectedModuleChange({ path, depth: 'transitive' });
    },
    [modulePath, onSelectedModuleChange],
  );
  const interaction = useMemo(
    () => ({
      focusedModule,
      onFocusedModuleChange,
      onExpandCluster: (clusterId: string) =>
        setExpandedClusters((current) => new Set([...current, clusterId])),
    }),
    [focusedModule, onFocusedModuleChange],
  );

  if (model.modules.size === 0) {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground',
          className,
        )}
      >
        No modules configured
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'h-full w-full transition-opacity duration-150',
        fitted ? 'opacity-100' : 'opacity-0',
        className,
      )}
      aria-label={ariaLabel}
    >
      <ModuleGraphInteractionContext.Provider value={interaction}>
        <ReactFlow
          nodes={layout.nodes}
          edges={layout.edges}
          nodeTypes={moduleGraphNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          minZoom={0.08}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          zoomOnDoubleClick={false}
          onNodeClick={onNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onNodeMouseEnter={(_event, node) => {
            const path = modulePath(node);
            if (path && canHoverModule(selectionActive, selectedModule, path)) {
              onHoveredModuleChange(path);
            }
          }}
          onNodeMouseLeave={(_event, node) => {
            if (modulePath(node) === hoveredModule) onHoveredModuleChange(null);
          }}
          onPaneClick={() => onSelectedModuleChange(null)}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={22} />
          <Panel position="top-left">
            <div className="nodrag nopan flex items-center gap-3 rounded-md border border-border bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
              <div>
                <p className="text-[10px] font-semibold">
                  Unified module graph
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {model.modules.size} modules · {model.observedEdges.length}{' '}
                  imports
                  {layout.collapsedClusterCount > 0
                    ? ` · ${layout.collapsedClusterCount} clusters`
                    : ''}
                </p>
              </div>
              {expandedClusters.size > 0 && (
                <button
                  type="button"
                  className="rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setExpandedClusters(new Set())}
                >
                  Recluster
                </button>
              )}
            </div>
          </Panel>
          {selectedModule && (
            <Panel position="top-right">
              <div className="nodrag nopan flex items-center gap-2 rounded-md border border-border bg-background/95 p-1 shadow-sm backdrop-blur">
                {(['direct', 'transitive'] as const).map((depth) => (
                  <button
                    key={depth}
                    type="button"
                    className={cn(
                      'rounded px-2 py-1 text-[10px] font-medium capitalize text-muted-foreground',
                      selectedModule.depth === depth &&
                        'bg-muted text-foreground',
                    )}
                    onClick={() =>
                      onSelectedModuleChange({
                        path: selectedModule.path,
                        depth,
                      })
                    }
                  >
                    {depth}
                  </button>
                ))}
              </div>
            </Panel>
          )}
          <Panel position="bottom-left">
            <div className="nodrag nopan flex items-center gap-4 rounded-md border border-border bg-background/95 px-3 py-2 text-[9px] text-muted-foreground shadow-sm backdrop-blur">
              <span>imports flow top ↓ bottom · layer is color only</span>
              <span>left-click neighbors · right-click transitive</span>
              <span>click clusters to expand</span>
              <span className="flex items-center gap-1">
                <span
                  className="h-0.5 w-4"
                  style={{ background: moduleColors.outgoing }}
                />
                imports
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="h-0.5 w-4"
                  style={{ background: moduleColors.incoming }}
                />
                consumed by
              </span>
            </div>
          </Panel>
        </ReactFlow>
      </ModuleGraphInteractionContext.Provider>
    </div>
  );
}
