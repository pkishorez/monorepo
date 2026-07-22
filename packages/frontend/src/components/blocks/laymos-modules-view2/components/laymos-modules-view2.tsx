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

import { useFitViewOnResize } from '../../laymos-modules/hooks/use-fit-view-on-resize';
import { moduleColors } from '../../laymos-modules/lib/colors';
import { buildLaymosModulesModel } from '../../laymos-modules/lib/model';
import type { LaymosModulesView2Props } from '../types';
import { getTreeActiveModulesModel } from '../lib/connectivity';
import { computeTreeFlowLayout } from '../lib/layout';
import { treeNodeTypes, TreeInteractionContext } from './flow-nodes';
import { ModuleFocusDialog } from './module-focus-dialog';

/** Renders Laymos modules as left-to-right layer cards with file-tree rows. */
export function LaymosModulesView2(props: LaymosModulesView2Props) {
  return (
    <ReactFlowProvider>
      <LaymosModulesView2Inner {...props} />
    </ReactFlowProvider>
  );
}

function LaymosModulesView2Inner({
  report,
  selectedModule,
  onSelectedModuleChange,
  hoveredModule,
  onHoveredModuleChange,
  focusedModule,
  onFocusedModuleChange,
  className,
  ariaLabel = 'Laymos module architecture file-tree view',
}: LaymosModulesView2Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dialogModule, setDialogModule] = useState<string | null>(null);
  const [dialogTransitive, setDialogTransitive] = useState(false);
  const model = useMemo(() => buildLaymosModulesModel(report), [report]);
  const preview = hoveredModule ?? focusedModule;
  const active = useMemo(
    () => getTreeActiveModulesModel(model, selectedModule, preview),
    [model, preview, selectedModule],
  );
  const layout = useMemo(
    () => computeTreeFlowLayout(model, active),
    [model, active],
  );
  const fitted = useFitViewOnResize(containerRef, report.architecture);

  const modulePath = useCallback((node: Node): string | null => {
    return node.type === 'tree-module'
      ? (node.data as { path: string }).path
      : null;
  }, []);
  const openDialog = useCallback((path: string) => {
    setDialogModule(path);
    setDialogTransitive(false);
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
      openDialog(path);
    },
    [modulePath, openDialog],
  );
  const interaction = useMemo(
    () => ({
      focusedModule,
      onFocusedModuleChange,
      onOpenModule: openDialog,
    }),
    [focusedModule, onFocusedModuleChange, openDialog],
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
    <>
      <div
        ref={containerRef}
        className={cn(
          'h-full w-full transition-opacity duration-150',
          fitted ? 'opacity-100' : 'opacity-0',
          className,
        )}
        aria-label={ariaLabel}
      >
        <TreeInteractionContext.Provider value={interaction}>
          <ReactFlow
            nodes={layout.nodes}
            edges={layout.edges}
            nodeTypes={treeNodeTypes}
            fitView
            fitViewOptions={{ padding: 0.14 }}
            minZoom={0.08}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnDoubleClick={false}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onNodeMouseEnter={(_event, node) => {
              const path = modulePath(node);
              if (path) onHoveredModuleChange(path);
            }}
            onNodeMouseLeave={() => onHoveredModuleChange(null)}
            onPaneClick={() => onSelectedModuleChange(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border)" gap={20} />
            {selectedModule && (
              <Panel position="top-left">
                <div className="nodrag nopan flex items-center gap-3 rounded-md border border-border bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
                  <div className="min-w-0">
                    <p className="max-w-56 truncate font-mono text-[10px] font-medium text-foreground">
                      {model.modules.get(selectedModule.path)?.label ??
                        selectedModule.path}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      Hover a connected module to expand its dependencies
                    </p>
                  </div>
                  <div
                    className="grid shrink-0 grid-cols-2 rounded-md border border-border bg-muted/35 p-0.5"
                    aria-label="Connection depth"
                  >
                    {(['direct', 'transitive'] as const).map((depth) => (
                      <button
                        key={depth}
                        type="button"
                        className={cn(
                          'rounded px-2 py-1 text-[10px] font-medium capitalize text-muted-foreground',
                          selectedModule.depth === depth &&
                            'bg-background text-foreground shadow-sm',
                        )}
                        onClick={() =>
                          onSelectedModuleChange({
                            path: selectedModule.path,
                            depth,
                          })
                        }
                        aria-pressed={selectedModule.depth === depth}
                      >
                        {depth}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => onSelectedModuleChange(null)}
                  >
                    Clear
                  </button>
                </div>
              </Panel>
            )}
            <Panel position="bottom-left">
              <div className="nodrag nopan flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-background/95 px-3 py-2 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
                <span>imports flow left → right</span>
                <span>
                  click keeps direct edges · use the depth control for
                  transitive
                </span>
                <span>
                  right-click or{' '}
                  <span className="font-medium text-foreground">
                    graph icon
                  </span>{' '}
                  opens connection graph
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="h-0.5 w-4"
                    style={{ background: moduleColors.outgoing }}
                  />{' '}
                  imports
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="h-0.5 w-4"
                    style={{ background: moduleColors.incoming }}
                  />{' '}
                  consumed by
                </span>
              </div>
            </Panel>
          </ReactFlow>
        </TreeInteractionContext.Provider>
      </div>
      <ModuleFocusDialog
        model={model}
        modulePath={dialogModule}
        transitive={dialogTransitive}
        onModulePathChange={setDialogModule}
        onTransitiveChange={setDialogTransitive}
      />
    </>
  );
}
