import '@xyflow/react/dist/style.css';

import {
  Background,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type Node,
} from '@xyflow/react';
import { useCallback, useMemo, useRef, type MouseEvent } from 'react';

import { cn } from '#lib/utils';

import { InteractionProvider } from '../context/interaction-context';
import { useFitViewOnResize } from '../hooks/use-fit-view-on-resize';
import { getActiveModulesModel } from '../lib/connectivity';
import { computeLaymosModulesFlowLayout } from '../lib/layout';
import { buildLaymosModulesModel } from '../lib/model';
import type { LaymosModulesProps } from '../types';
import { ContextCard } from './context-card';
import { laymosModuleNodeTypes } from './flow-nodes';

/** Renders a controlled, progressively disclosed view of Laymos modules. */
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
  defaultMinimise = false,
  className,
  ariaLabel = 'Laymos module architecture',
}: LaymosModulesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const model = useMemo(() => buildLaymosModulesModel(report), [report]);
  const preview = hoveredModule ?? focusedModule;
  const active = useMemo(
    () => getActiveModulesModel(model, selectedModule, preview),
    [model, preview, selectedModule],
  );
  const layout = useMemo(
    () => computeLaymosModulesFlowLayout(model, active),
    [active, model],
  );
  const fitted = useFitViewOnResize(containerRef, report.architecture);

  const getModulePath = useCallback((node: Node): string | null => {
    if (node.type !== 'module') return null;
    return (node.data as { path: string }).path;
  }, []);

  const selectModule = useCallback(
    (path: string, depth: 'direct' | 'transitive') => {
      onSelectedModuleChange(
        selectedModule?.path === path && selectedModule.depth === depth
          ? null
          : { path, depth },
      );
    },
    [onSelectedModuleChange, selectedModule],
  );

  const handleNodeClick = useCallback(
    (_event: MouseEvent, node: Node) => {
      const path = getModulePath(node);
      if (path) selectModule(path, 'direct');
    },
    [getModulePath, selectModule],
  );

  const handleNodeContextMenu = useCallback(
    (event: MouseEvent, node: Node) => {
      const path = getModulePath(node);
      if (!path) return;
      event.preventDefault();
      selectModule(path, 'transitive');
    },
    [getModulePath, selectModule],
  );

  const handleNodeMouseEnter = useCallback(
    (_event: MouseEvent, node: Node) => {
      const path = getModulePath(node);
      if (path) onHoveredModuleChange(path);
    },
    [getModulePath, onHoveredModuleChange],
  );

  if (model.modules.size === 0) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground',
          className,
        )}
      >
        No modules configured
      </div>
    );
  }

  return (
    <InteractionProvider
      selectedModule={selectedModule}
      onSelectedModuleChange={onSelectedModuleChange}
      hoveredModule={hoveredModule}
      onHoveredModuleChange={onHoveredModuleChange}
      focusedModule={focusedModule}
      onFocusedModuleChange={onFocusedModuleChange}
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
          nodeTypes={laymosModuleNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          minZoom={0.08}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={() => onHoveredModuleChange(null)}
          onPaneClick={() => onSelectedModuleChange(null)}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={20} />
          <Panel position="top-right">
            <ContextCard
              model={model}
              active={active}
              selectedModule={selectedModule}
              onSelectedModuleChange={onSelectedModuleChange}
              defaultMinimise={defaultMinimise}
            />
          </Panel>
        </ReactFlow>
      </div>
    </InteractionProvider>
  );
}
