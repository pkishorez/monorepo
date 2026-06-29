import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { createContext, useContext, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

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
  moduleKey,
  VISIBILITY_COLOR,
  type Visibility,
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
 * cards (left → right in dependency order). Selecting a feature lights up the
 * slice of modules it owns/consumes across the cards.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const fitted = useFitViewOnResize(containerRef);

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
    if (!activeChipId) {
      return {
        ownedModules: null,
        consumedModules: null,
        highlightedModules: null,
      } as {
        ownedModules: Set<string> | null;
        consumedModules: Set<string> | null;
        highlightedModules: Set<string> | null;
      };
    }

    const chip =
      model.featureChips.find((c) => c.id === activeChipId) ??
      model.filterChips.find((c) => c.id === activeChipId);

    if (!chip)
      return {
        ownedModules: null,
        consumedModules: null,
        highlightedModules: null,
      };

    if (chip.kind === 'feature') {
      const focus = featureFocus(summary, chip.id);
      const highlighted = new Set([...focus.owned, ...focus.consumed]);
      return {
        ownedModules: focus.owned,
        consumedModules: focus.consumed,
        highlightedModules: highlighted,
      };
    }

    // Filter chip — all in owned, none in consumed
    const keys = filterChipModules(chip.id as FilterChipId, modules);
    return {
      ownedModules: keys,
      consumedModules: null,
      highlightedModules: keys,
    };
  }, [activeChipId, model, summary, modules]);

  // With no feature/filter chip active, the selected and hovered modules both
  // stay lit (everything else dims) — so hovering elsewhere never suppresses the
  // selection. Only the selected module gets the strong "owned" fill; the
  // hovered one reads via its distinct hover style.
  const { ownedModules, consumedModules, highlightedModules } = useMemo(() => {
    if (activeChipId) return chipHighlight;
    const lit = new Set<string>();
    if (selectedModule) lit.add(selectedModule);
    if (hoveredModule) lit.add(hoveredModule);
    if (lit.size === 0) return chipHighlight;
    return {
      ownedModules: selectedModule ? new Set([selectedModule]) : null,
      consumedModules: null,
      highlightedModules: lit,
    };
  }, [activeChipId, hoveredModule, selectedModule, chipHighlight]);

  // For module-click: which chips own/consume the selected module?
  const moduleHighlightedChips = useMemo<Set<string>>(() => {
    if (!selectedModule || activeChipId) return new Set();
    const touched = new Set<string>();
    for (const fc of model.featureChips) {
      const focus = featureFocus(summary, fc.id);
      if (
        focus.owned.has(selectedModule) ||
        focus.consumed.has(selectedModule)
      ) {
        touched.add(fc.id);
      }
    }
    for (const fc of model.filterChips) {
      const keys = filterChipModules(fc.id as FilterChipId, modules);
      if (keys.has(selectedModule)) touched.add(fc.id);
    }
    return touched;
  }, [selectedModule, activeChipId, model, summary, modules]);

  // The grid is a single React Flow node. Selection/hover highlighting flows
  // through context rather than node.data so it never recreates the node — which
  // would make React Flow re-measure and visibly flicker on every mouse move.
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

  const interaction = useMemo<ModuleInteraction>(
    () => ({
      highlightedModules,
      ownedModules,
      consumedModules,
      selectedModule,
      onSelectModule,
      onHoverModule: setHoveredModule,
    }),
    [
      highlightedModules,
      ownedModules,
      consumedModules,
      selectedModule,
      onSelectModule,
    ],
  );

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
                {chip.ownedCount > 0 && (
                  <span className="ml-1 opacity-60">{chip.ownedCount}</span>
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
      </div>

      {/* Layer cards canvas: the whole grid is a single zoomable/pannable node */}
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
            // Also enables pointer events on the node: react-flow sets
            // `pointer-events: none` on nodes with no interactivity at all.
            onNodeClick={handleClearSelection}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border)" gap={20} />
          </ReactFlow>
        </ModuleInteractionContext.Provider>
      </div>

      {/* Footer: reading hint + tier legend */}
      <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>imports flow left → right</span>
        <div className="flex items-center gap-3">
          {(['public', 'shared', 'private'] as Visibility[]).map((tier) => (
            <span key={tier} className="flex items-center gap-1">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: VISIBILITY_COLOR[tier] }}
              />
              {tier}
            </span>
          ))}
        </div>
      </div>
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
  ownedModules: Set<string> | null;
  consumedModules: Set<string> | null;
  selectedModule: string | null;
  onSelectModule: (key: string | null) => void;
  onHoverModule: (key: string | null) => void;
};

const ModuleInteractionContext = createContext<ModuleInteraction | null>(null);

function LayerGridNode({ data }: NodeProps<Node<LayerGridNodeData>>) {
  const interaction = useContext(ModuleInteractionContext);
  if (!interaction) return null;
  const hasGroups = data.grid.groupBands.length > 0;
  // When groups exist, a leading column holds the group band labels; stack
  // labels and cards shift right by one.
  const groupCol = hasGroups ? 1 : 0;
  const stackCol = groupCol + 1;
  const cardColBase = stackCol + 1;
  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: `${hasGroups ? 'max-content ' : ''}max-content repeat(${data.grid.columnCount}, 15rem)`,
      }}
    >
      {data.grid.groupBands.map((band) => (
        <div
          key={band.group}
          style={{
            gridColumn: groupCol,
            gridRow: `${band.rowStart + 1} / span ${band.rowSpan}`,
          }}
          className="flex items-center justify-center rounded-md bg-muted/30 px-1"
        >
          <span className="rotate-180 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 [writing-mode:vertical-rl]">
            {band.group}
          </span>
        </div>
      ))}
      {data.grid.stackRows.map((stack, row) => (
        <div
          key={stack}
          style={{ gridColumn: stackCol, gridRow: row + 1 }}
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
            gridColumn: card.column + cardColBase,
            gridRow: `${card.rowStart + 1} / span ${card.rowSpan}`,
          }}
        >
          <LayerCard
            card={card}
            declaredKeys={data.declaredKeys}
            highlightedModules={interaction.highlightedModules}
            ownedModules={interaction.ownedModules}
            consumedModules={interaction.consumedModules}
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
  ownedModules: Set<string> | null;
  consumedModules: Set<string> | null;
  selectedModule: string | null;
  onSelectModule: (key: string | null) => void;
  onHoverModule: (key: string | null) => void;
};

function LayerCard({
  card,
  declaredKeys,
  highlightedModules,
  ownedModules,
  consumedModules,
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
          ownedModules={ownedModules}
          consumedModules={consumedModules}
          selectedModule={selectedModule}
          onSelectModule={onSelectModule}
          onHoverModule={onHoverModule}
        />
      )}
    </div>
  );
}
