import '@xyflow/react/dist/style.css';

import {
  Background,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type Node,
} from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';

import { Switch } from '#components/ui/switch';
import { cn } from '#lib/utils';

import { ModuleGraphInteractionProvider } from '../context/interaction-context';
import { useModuleGraphFit } from '../hooks/use-module-graph-fit';
import { moduleGraphColors } from '../lib/colors';
import { computeModuleGraphLayout, type ModuleLayoutMode } from '../lib/layout';
import { buildModuleGraphModel } from '../lib/model';
import { getModuleGraphSelection } from '../lib/selection';
import type { LaymosModulesProps } from '../types';
import { ModuleContextCard } from './context-card';
import { moduleGraphNodeTypes } from './flow-nodes';

/** Renders modules as expandable layer containers inside architecture lanes. */
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
  defaultShowLayerConnections = false,
  initialViewport,
  onViewportChange,
  className,
  ariaLabel = 'Laymos module architecture',
}: LaymosModulesProps) {
  const flowId = `laymos-modules-${useId()}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const model = useMemo(() => buildModuleGraphModel(report), [report]);
  const [showLayerConnections, setShowLayerConnections] = useState(
    defaultShowLayerConnections,
  );
  const [moduleLayout, setModuleLayout] = useState<ModuleLayoutMode>('pack');
  const [expandedLayers, setExpandedLayers] = useState<ReadonlySet<string>>(
    () => new Set(model.layers.keys()),
  );
  useEffect(() => {
    setExpandedLayers(new Set(model.layers.keys()));
  }, [model]);

  const selectionWithoutHover = useMemo(
    () => getModuleGraphSelection(model, selectedModule, null),
    [model, selectedModule],
  );
  const requestedPreview = hoveredModule ?? focusedModule;
  const previewModule =
    requestedPreview &&
    (!selectedModule ||
      moduleLayout === 'tree' ||
      selectionWithoutHover.visibleModules.has(requestedPreview))
      ? requestedPreview
      : null;
  const selection = useMemo(
    () => getModuleGraphSelection(model, selectedModule, requestedPreview),
    [model, requestedPreview, selectedModule],
  );
  const contextSelection = useMemo(
    () =>
      moduleLayout === 'tree' && previewModule
        ? ({ path: previewModule, depth: 'direct' } as const)
        : selectedModule,
    [moduleLayout, previewModule, selectedModule],
  );
  const contextSelectionModel = useMemo(
    () =>
      moduleLayout === 'tree'
        ? getModuleGraphSelection(model, contextSelection, null)
        : selection,
    [contextSelection, model, moduleLayout, selection],
  );
  const layout = useMemo(
    () =>
      computeModuleGraphLayout(
        model,
        selection,
        expandedLayers,
        moduleLayout,
        showLayerConnections,
      ),
    [expandedLayers, model, moduleLayout, showLayerConnections, selection],
  );
  const geometryKey = useMemo(
    () =>
      `${[...model.layers.keys()].sort().join('\0')}\0${model.modules.size}\0${moduleLayout}`,
    [model, moduleLayout],
  );
  const fitted = useModuleGraphFit(
    containerRef,
    geometryKey,
    initialViewport === undefined,
  );

  const toggleLayer = useCallback((name: string) => {
    setExpandedLayers((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);
  const toggleGraph = useCallback((layerNames: readonly string[]) => {
    setExpandedLayers((current) => {
      const next = new Set(current);
      const collapse = layerNames.some((name) => current.has(name));
      for (const name of layerNames) {
        if (collapse) next.delete(name);
        else next.add(name);
      }
      return next;
    });
  }, []);
  const modulePath = useCallback((node: Node): string | null => {
    return node.type === 'module-tile'
      ? (node.data as { path: string }).path
      : null;
  }, []);
  const onNodeContextMenu = useCallback(
    (event: MouseEvent, node: Node) => {
      if (modulePath(node)) return;
      event.preventDefault();
      if (node.type === 'module-layer-container') {
        toggleLayer((node.data as { name: string }).name);
        return;
      }
      if (node.type === 'module-graph-header') {
        toggleGraph(
          (node.data as { layerNames: readonly string[] }).layerNames,
        );
      }
    },
    [modulePath, toggleGraph, toggleLayer],
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
    <ModuleGraphInteractionProvider
      selection={selection}
      selectedModule={selectedModule}
      hoveredModule={hoveredModule}
      focusedModule={focusedModule}
      onSelectedModuleChange={onSelectedModuleChange}
      onHoveredModuleChange={onHoveredModuleChange}
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
          id={flowId}
          nodes={layout.nodes}
          edges={layout.edges}
          nodeTypes={moduleGraphNodeTypes}
          defaultViewport={initialViewport}
          fitView={initialViewport === undefined}
          fitViewOptions={{ padding: 0.16 }}
          minZoom={0.08}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zIndexMode="manual"
          paneClickDistance={6}
          zoomOnDoubleClick={false}
          onNodeContextMenu={onNodeContextMenu}
          onPaneClick={() => onSelectedModuleChange(null)}
          onMoveEnd={(_event, viewport) => onViewportChange?.(viewport)}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={20} />
          <Panel position="top-right">
            <div className="nodrag nopan w-56 rounded-md border border-border bg-background/95 p-2.5 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <span>Module layout</span>
                <div
                  className="flex rounded-md bg-muted p-0.5"
                  role="group"
                  aria-label="Module layout"
                >
                  {(['pack', 'tree'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={cn(
                        'rounded px-2 py-1 capitalize transition-colors',
                        moduleLayout === mode
                          ? 'bg-background text-foreground shadow-sm'
                          : 'hover:text-foreground',
                      )}
                      onClick={() => setModuleLayout(mode)}
                      aria-pressed={moduleLayout === mode}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <label className="mt-2 flex cursor-pointer items-center justify-between gap-4 border-t border-border/60 pt-2">
                Layer connections
                <Switch
                  size="sm"
                  checked={showLayerConnections}
                  onCheckedChange={setShowLayerConnections}
                  aria-label="Show layer connections"
                />
              </label>
            </div>
          </Panel>
          {selectedModule && moduleLayout === 'pack' && (
            <Panel position="top-left">
              <div className="nodrag nopan flex items-center gap-3 rounded-md border border-border bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
                <div className="min-w-0">
                  <p className="max-w-52 truncate font-mono text-[10px] font-medium">
                    {model.modules.get(selectedModule.path)?.label ??
                      selectedModule.path}
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    {selection.incomingCount} incoming ·{' '}
                    {selection.outgoingCount} outgoing
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-2 rounded-md border border-border bg-muted/35 p-0.5">
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
            <div className="nodrag nopan flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-background/95 px-3 py-2 text-[9px] text-muted-foreground shadow-sm backdrop-blur">
              <span>click direct · right-click transitive</span>
              <span>right-click graph or layer to minimise</span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-sky-500" />
                root
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                sink
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="h-0.5 w-4"
                  style={{ background: moduleGraphColors.outgoing }}
                />
                imports
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="h-0.5 w-4"
                  style={{ background: moduleGraphColors.incoming }}
                />
                consumed by
              </span>
            </div>
          </Panel>
          <Panel position="bottom-right">
            <ModuleContextCard
              model={model}
              selection={contextSelection}
              selectionModel={contextSelectionModel}
              previewModule={moduleLayout === 'tree' ? null : previewModule}
              defaultMinimise={defaultMinimise}
            />
          </Panel>
        </ReactFlow>
      </div>
    </ModuleGraphInteractionProvider>
  );
}
