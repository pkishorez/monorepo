import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FileJson, SlidersHorizontal } from 'lucide-react';

import { cn } from '#lib/utils';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';

import {
  allModules,
  featureFocus,
  featureModuleGraph,
  featureRules,
  moduleKey,
  type VisualizationConfig,
  type VizSummary,
} from '../../model';
import {
  buildLayerCardGroups,
  type LayerGrid,
  type LayerGridCard,
} from '../../model/layer-model';
import { FIT_VIEW_OPTIONS } from '../react-flow-options';
import { useFitViewOnResize } from '../use-fit-view-on-resize';
import {
  buildFeatureLayersModel,
  filterChipModules,
  type FilterChip,
  type FilterChipId,
} from './feature-layers-model';
import { ModuleChips } from './module-chips';
import { FeatureGraphPanel } from './feature-graph-panel';
import { FeatureRulesDialog } from './feature-rules-dialog';
import type { ColumnMode, EdgeMode } from './feature-graph-layout';

type FeatureLayersPanelProps = {
  config: VisualizationConfig;
  summary?: VizSummary;
  selectedFeature: string | null;
  selectedModule: string | null;
  onSelectFeature: (feature: string | null) => void;
  onSelectModule: (key: string | null) => void;
  onHoverModule?: (moduleKey: string | null) => void;
};

/**
 * Cross-cutting Features tab: feature chips above a zoomable canvas of layer
 * cards (left → right in dependency order). Selecting a feature shows only that
 * feature's member cone in the graph view, or highlights members in the grid.
 */
export function FeatureLayersPanel(props: FeatureLayersPanelProps) {
  return (
    <ReactFlowProvider>
      <FeatureLayersPanelInner {...props} />
    </ReactFlowProvider>
  );
}

function FeatureLayersPanelInner({
  config,
  summary,
  selectedFeature,
  selectedModule,
  onSelectFeature,
  onSelectModule,
}: FeatureLayersPanelProps) {
  const [hoveredChip, setHoveredChip] = useState<string | null>(null);
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [featureView, setFeatureView] = useState<'graph' | 'grid'>('graph');
  const [columnMode, setColumnMode] = useState<ColumnMode>('layer');
  const [edgeMode, setEdgeMode] = useState<EdgeMode>('reduced');
  useEffect(() => {
    if (!selectedFeature) setFeatureView('graph');
  }, [selectedFeature]);
  const containerRef = useRef<HTMLDivElement>(null);
  const fitted = useFitViewOnResize(containerRef, [
    selectedFeature,
    featureView,
  ]);

  const model = useMemo(
    () => buildFeatureLayersModel(config, summary),
    [config, summary],
  );

  const modules = useMemo(() => allModules(config, summary), [config, summary]);

  const declaredKeys = useMemo(
    () =>
      new Set((config.modules ?? []).map((m) => moduleKey(m.layer, m.name))),
    [config],
  );

  // Derive highlight sets from active chip (hovered takes priority over selected)
  const activeChipId = hoveredChip ?? selectedFeature;

  const chipHighlight = useMemo(() => {
    if (!activeChipId) return null as Set<string> | null;

    const chip =
      model.featureChips.find((c) => c.id === activeChipId) ??
      model.filterChips.find((c) => c.id === activeChipId);

    if (!chip) return null;

    if (chip.kind === 'feature') {
      const focus = featureFocus(summary, chip.id);
      return focus.members.size > 0 ? focus.members : null;
    }

    // Filter chip
    return filterChipModules(chip.id as FilterChipId, modules);
  }, [activeChipId, model, summary, modules]);

  // With no feature/filter chip active, the selected and hovered modules both
  // stay lit (everything else dims).
  const highlightedModules = useMemo(() => {
    if (activeChipId) return chipHighlight;
    const lit = new Set<string>();
    if (selectedModule) lit.add(selectedModule);
    if (hoveredModule) lit.add(hoveredModule);
    return lit.size > 0 ? lit : null;
  }, [activeChipId, hoveredModule, selectedModule, chipHighlight]);

  // For module-click: which chips mention the selected module?
  const moduleHighlightedChips = useMemo<Set<string>>(() => {
    if (!selectedModule || activeChipId) return new Set();
    const touched = new Set<string>();
    for (const fc of model.featureChips) {
      const focus = featureFocus(summary, fc.id);
      if (focus.members.has(selectedModule)) touched.add(fc.id);
    }
    for (const fc of model.filterChips) {
      const keys = filterChipModules(fc.id as FilterChipId, modules);
      if (keys.has(selectedModule)) touched.add(fc.id);
    }
    return touched;
  }, [selectedModule, activeChipId, model, summary, modules]);

  const nodes = useMemo<Node<LayerGridNodeData>[]>(
    () => [
      {
        id: 'layer-grid',
        type: 'layer-grid',
        position: { x: 0, y: 0 },
        draggable: false,
        selectable: false,
        data: { grid: model.layerGrid, declaredKeys },
      },
    ],
    [model.layerGrid, declaredKeys],
  );

  // While a feature is selected, a module may only be selected if it belongs to
  // that feature. With no feature, selection is unrestricted.
  const guardedSelectModule = useCallback(
    (key: string | null) => {
      if (key !== null && selectedFeature && !highlightedModules?.has(key)) {
        return;
      }
      onSelectModule(key);
    },
    [selectedFeature, highlightedModules, onSelectModule],
  );

  const interaction = useMemo<ModuleInteraction>(
    () => ({
      highlightedModules,
      selectedModule,
      onSelectModule: guardedSelectModule,
      onHoverModule: setHoveredModule,
    }),
    [highlightedModules, selectedModule, guardedSelectModule],
  );

  // The selected feature's module-connection graph.
  const featureGraph = useMemo(
    () =>
      selectedFeature
        ? featureModuleGraph(config, summary, selectedFeature)
        : null,
    [config, summary, selectedFeature],
  );

  const rules = useMemo(
    () => (selectedFeature ? featureRules(config, selectedFeature) : null),
    [config, selectedFeature],
  );

  // Architecture layers in declared order — swimlane column order for the graph.
  const layerOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const stack of config.stacks) {
      for (const l of stack.layers) {
        if (!seen.has(l.name)) {
          seen.add(l.name);
          order.push(l.name);
        }
      }
    }
    return order;
  }, [config]);

  const showGraph = Boolean(selectedFeature) && featureView === 'graph';

  function handleChipClick(id: string) {
    onSelectFeature(selectedFeature === id ? null : id);
  }

  function handleClearSelection() {
    onSelectFeature(null);
    onSelectModule(null);
  }

  const activeFilter: FilterChip | undefined = model.filterChips.find(
    (c) => c.id === selectedFeature,
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Chip bar: features left, lens dropdown right */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-background/80 px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {model.featureChips.map((chip) => {
            const isActive =
              selectedFeature === chip.id ||
              moduleHighlightedChips.has(chip.id);
            return (
              <button
                key={chip.id}
                type="button"
                onMouseEnter={() => setHoveredChip(chip.id)}
                onMouseLeave={() => setHoveredChip(null)}
                onClick={() => handleChipClick(chip.id)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-border bg-muted/50 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {chip.label}
                {chip.memberCount > 0 && (
                  <span className="ml-1 opacity-60">{chip.memberCount}</span>
                )}
              </button>
            );
          })}
          {model.featureChips.length === 0 && (
            <span className="text-xs text-muted-foreground">
              No features defined
            </span>
          )}
        </div>
        {model.filterChips.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                activeFilter ||
                  moduleHighlightedChipsHasFilter(
                    moduleHighlightedChips,
                    model.filterChips,
                  )
                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
              )}
            >
              <SlidersHorizontal className="h-3 w-3" aria-hidden />
              {activeFilter ? activeFilter.label : 'Lenses'}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {model.filterChips.map((chip) => (
                <DropdownMenuCheckboxItem
                  key={chip.id}
                  checked={selectedFeature === chip.id}
                  onCheckedChange={() => handleChipClick(chip.id)}
                  className="text-xs"
                >
                  {chip.label}
                  {moduleHighlightedChips.has(chip.id) && (
                    <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                  )}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {showGraph && (
          <div className="flex shrink-0 rounded-md border border-border bg-background/80 p-0.5">
            {(
              [
                ['layer', 'Layers'],
                ['depth', 'Compact'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setColumnMode(mode)}
                aria-pressed={columnMode === mode}
                title={
                  mode === 'layer'
                    ? 'Columns by architecture layer'
                    : 'Columns packed by import depth'
                }
                className={cn(
                  'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                  columnMode === mode
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {showGraph && (
          <div className="flex shrink-0 rounded-md border border-border bg-background/80 p-0.5">
            {(
              [
                ['reduced', 'Simplify'],
                ['all', 'All edges'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setEdgeMode(mode)}
                aria-pressed={edgeMode === mode}
                title={
                  mode === 'reduced'
                    ? 'Hide edges implied by a longer import path'
                    : 'Draw every direct import edge'
                }
                className={cn(
                  'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                  edgeMode === mode
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {selectedFeature && (
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            title="Show the rules configured for this feature"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <FileJson className="h-3 w-3" aria-hidden />
            Rules
          </button>
        )}
        {selectedFeature && (
          <div className="flex shrink-0 rounded-md border border-border bg-background/80 p-0.5">
            {(['graph', 'grid'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setFeatureView(v)}
                aria-pressed={featureView === v}
                className={cn(
                  'rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-colors',
                  featureView === v
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Canvas: a feature's module-connection graph by default, or the layer grid. */}
      {showGraph && featureGraph ? (
        <div className="min-h-0 flex-1">
          <FeatureGraphPanel
            graph={featureGraph}
            layerOrder={layerOrder}
            columnMode={columnMode}
            edgeMode={edgeMode}
            selectedModule={selectedModule}
            onSelectModule={onSelectModule}
            onHoverModule={setHoveredModule}
          />
        </div>
      ) : (
        <div
          ref={containerRef}
          className={cn(
            'min-h-0 flex-1 transition-opacity duration-150',
            fitted ? 'opacity-100' : 'opacity-0',
          )}
        >
          <ModuleInteractionContext.Provider value={interaction}>
            <ReactFlow
              nodes={nodes}
              nodeTypes={layerGridNodeTypes}
              fitView
              fitViewOptions={FIT_VIEW_OPTIONS}
              minZoom={0.1}
              nodesDraggable={false}
              nodesConnectable={false}
              zoomOnDoubleClick={false}
              onPaneClick={handleClearSelection}
              onNodeClick={handleClearSelection}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="var(--border)" gap={20} />
            </ReactFlow>
          </ModuleInteractionContext.Provider>
        </div>
      )}

      {/* Footer */}
      <div className="flex shrink-0 items-center border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>imports flow left → right</span>
      </div>

      <FeatureRulesDialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        feature={selectedFeature}
        rules={rules}
      />
    </div>
  );
}

function moduleHighlightedChipsHasFilter(
  touched: Set<string>,
  filterChips: FilterChip[],
): boolean {
  return filterChips.some((c) => touched.has(c.id));
}

type LayerGridNodeData = {
  grid: LayerGrid;
  declaredKeys: ReadonlySet<string>;
};

/** Selection/hover state for the module list, kept off node.data to avoid
 *  recreating the React Flow node (and the flicker that causes) on every event. */
type ModuleInteraction = {
  highlightedModules: Set<string> | null;
  selectedModule: string | null;
  onSelectModule: (key: string | null) => void;
  onHoverModule: (key: string | null) => void;
};

const ModuleInteractionContext = createContext<ModuleInteraction | null>(null);

function LayerGridNode({ data }: NodeProps<Node<LayerGridNodeData>>) {
  const interaction = useContext(ModuleInteractionContext);
  if (!interaction) return null;
  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: `max-content repeat(${data.grid.columnCount}, 15rem)`,
      }}
    >
      {data.grid.stackRows.map((stack, row) => (
        <div
          key={stack}
          style={{ gridColumn: 1, gridRow: row + 1 }}
          className="flex items-center"
        >
          <span className="rotate-180 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 [writing-mode:vertical-rl]">
            {stack}
          </span>
        </div>
      ))}
      {data.grid.cards.map((card) => (
        <div
          key={card.key}
          style={{
            gridColumn: card.column + 2,
            gridRow: `${card.rowStart + 1} / span ${card.rowSpan}`,
          }}
        >
          <LayerCard
            card={card}
            declaredKeys={data.declaredKeys}
            highlightedModules={interaction.highlightedModules}
            selectedModule={interaction.selectedModule}
            onSelectModule={interaction.onSelectModule}
            onHoverModule={interaction.onHoverModule}
          />
        </div>
      ))}
    </div>
  );
}

const layerGridNodeTypes = { 'layer-grid': LayerGridNode };

type LayerCardProps = {
  card: LayerGridCard;
  declaredKeys: ReadonlySet<string>;
  highlightedModules: Set<string> | null;
  selectedModule: string | null;
  onSelectModule: (key: string | null) => void;
  onHoverModule: (key: string | null) => void;
};

function LayerCard({
  card,
  declaredKeys,
  highlightedModules,
  selectedModule,
  onSelectModule,
  onHoverModule,
}: LayerCardProps) {
  const groups = useMemo(
    () => buildLayerCardGroups(card.modules, declaredKeys),
    [card.modules, declaredKeys],
  );

  const tooltip = [
    card.paths.join(', '),
    card.stacks.length > 1 ? `shared by ${card.stacks.join(' + ')}` : null,
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <div className="h-full rounded-lg border border-border bg-card shadow-sm">
      <div
        title={tooltip}
        className="flex items-baseline justify-between gap-2 rounded-t-lg border-b border-border/60 bg-card px-3 py-2"
      >
        <span className="truncate text-xs font-semibold uppercase tracking-wider text-foreground/80">
          {card.layer}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/60">
          {card.modules.length}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="px-3 py-3 text-[11px] text-muted-foreground/40">
          No modules
        </div>
      ) : (
        <ModuleChips
          groups={groups}
          highlightedModules={highlightedModules}
          selectedModule={selectedModule}
          onSelectModule={onSelectModule}
          onHoverModule={onHoverModule}
        />
      )}
    </div>
  );
}
