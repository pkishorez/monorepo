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
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '#lib/utils';

import {
  allModules,
  moduleKey,
  type ModuleRole,
  type ModuleRules,
  type VisualizationConfig,
  type VizSummary,
} from '../../model';
import {
  buildLayerGrid,
  buildModuleTree,
  type LayerGrid,
  type LayerGridCard,
} from '../../model/layer-model';
import type { GraphHover } from '../../use-dependency-cruiser-viz';
import { FIT_VIEW_OPTIONS } from '../react-flow-options';
import { useFitViewOnResize } from '../use-fit-view-on-resize';
import { ModuleChips } from './module-chips';
import { ModuleFocusPanel } from './module-focus-panel';

type ModulesPanelProps = {
  config: VisualizationConfig;
  summary?: VizSummary;
  /** Module owning the graph (right-click); non-null shows the radial view. */
  selectedModule: string | null;
  /** Module the file tree points at (left-click). */
  highlightedModule: string | null;
  onSelectModule: (key: string | null) => void;
  onHighlightModule: (key: string | null) => void;
  /** Previews a hovered module's files in the file tree. */
  onHoverGraphModule?: (hover: GraphHover | null) => void;
};

/**
 * Modules tab: a zoomable canvas of layer cards (left → right in dependency
 * order) with one chip per module. Click highlights a module (the file tree
 * collapses to it); right-click selects it — the canvas swaps to a radial view
 * of its direct/transitive dependencies. The file tree stays visible either way.
 */
export function ModulesPanel(props: ModulesPanelProps) {
  // Lives here (not in the focus panel) so it survives grid ↔ focus
  // round-trips — the focus overlay unmounts whenever selection clears.
  const [transitive, setTransitive] = useState(false);

  const opaqueKeys = useMemo(
    () =>
      new Set(
        (props.config.modules ?? [])
          .filter((m) => m.opaque)
          .map((m) => moduleKey(m.layer, m.name)),
      ),
    [props.config],
  );

  const rulesByKey = useMemo(() => {
    const map = new Map<string, ModuleRules>();
    for (const m of props.config.modules ?? []) {
      if (m.rules) map.set(moduleKey(m.layer, m.name), m.rules);
    }
    return map;
  }, [props.config]);

  const roleByKey = useMemo(
    () =>
      new Map<string, ModuleRole>(
        allModules(props.config, props.summary).map((m) => [m.key, m.role]),
      ),
    [props.config, props.summary],
  );

  const hoverByKey = useMemo(() => {
    const map = new Map<string, GraphHover>();
    for (const m of props.config.modules ?? []) {
      const key = moduleKey(m.layer, m.name);
      map.set(key, { key, modulePath: m.path, files: [] });
    }
    for (const c of props.summary?.moduleCoverage ?? []) {
      const hover = map.get(moduleKey(c.layer, c.module));
      if (hover) hover.files = c.files;
    }
    return map;
  }, [props.config, props.summary]);

  // The all-modules grid stays mounted while a module is focused so its zoom/pan
  // survives the round-trip; the focus view floats above it as a blurred,
  // translucent overlay rather than replacing (and remounting) the grid.
  return (
    <div className="relative h-full">
      <ReactFlowProvider>
        <ModulesGrid
          {...props}
          opaqueKeys={opaqueKeys}
          hoverByKey={hoverByKey}
        />
      </ReactFlowProvider>
      {props.selectedModule && (
        <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-sm">
          <ModuleFocusPanel
            selectedModule={props.selectedModule}
            highlightedModule={props.highlightedModule}
            summary={props.summary}
            opaqueKeys={opaqueKeys}
            rulesByKey={rulesByKey}
            roleByKey={roleByKey}
            hoverByKey={hoverByKey}
            onSelectModule={props.onSelectModule}
            onHighlightModule={props.onHighlightModule}
            onHoverGraphModule={props.onHoverGraphModule}
            transitive={transitive}
            onToggleTransitive={() => setTransitive((v) => !v)}
          />
        </div>
      )}
    </div>
  );
}

function ModulesGrid({
  config,
  summary,
  selectedModule,
  highlightedModule,
  onSelectModule,
  onHighlightModule,
  onHoverGraphModule,
  opaqueKeys,
  hoverByKey,
}: ModulesPanelProps & {
  opaqueKeys: ReadonlySet<string>;
  hoverByKey: ReadonlyMap<string, GraphHover>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitted = useFitViewOnResize(containerRef, []);

  const layerGrid = useMemo(
    () => buildLayerGrid(config, summary),
    [config, summary],
  );

  const declaredKeys = useMemo(
    () =>
      new Set((config.modules ?? []).map((m) => moduleKey(m.layer, m.name))),
    [config],
  );

  // Only explicit choices dim the rest of the grid; hover never does.
  const litModules = useMemo(() => {
    const lit = new Set<string>();
    if (highlightedModule) lit.add(highlightedModule);
    if (selectedModule) lit.add(selectedModule);
    return lit.size > 0 ? lit : null;
  }, [highlightedModule, selectedModule]);

  // Hover previews the module in the file tree, but only while no module is
  // highlighted or selected — an explicit choice makes hover inert.
  const handleHoverModule = useCallback(
    (key: string | null) => {
      if (!onHoverGraphModule) return;
      if (key && (highlightedModule || selectedModule)) return;
      onHoverGraphModule(key ? (hoverByKey.get(key) ?? null) : null);
    },
    [onHoverGraphModule, highlightedModule, selectedModule, hoverByKey],
  );

  const nodes = useMemo<Node<LayerGridNodeData>[]>(
    () => [
      {
        id: 'layer-grid',
        type: 'layer-grid',
        position: { x: 0, y: 0 },
        draggable: false,
        selectable: false,
        data: { grid: layerGrid, declaredKeys, opaqueKeys },
      },
    ],
    [layerGrid, declaredKeys, opaqueKeys],
  );

  const interaction = useMemo<ModuleInteraction>(
    () => ({
      litModules,
      selectedModule,
      onHighlightModule,
      onSelectModule,
      onHoverModule: handleHoverModule,
    }),
    [
      litModules,
      selectedModule,
      onHighlightModule,
      onSelectModule,
      handleHoverModule,
    ],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
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
            onPaneClick={() => onHighlightModule(null)}
            onNodeClick={() => onHighlightModule(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border)" gap={20} />
          </ReactFlow>
        </ModuleInteractionContext.Provider>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>
          imports flow left → right · click highlights · right-click selects
        </span>
        <span className="flex items-center gap-2">
          {/* Each key mirrors how the chip actually renders: root/leaf carry
              their wash, dead is dimmed + italic (no wash). */}
          <span className="rounded border border-border bg-emerald-500/15 px-1.5 py-0.5">
            root
          </span>
          <span className="rounded border border-border bg-violet-500/15 px-1.5 py-0.5">
            leaf
          </span>
          <span className="px-1.5 py-0.5 italic text-muted-foreground/60">
            dead
          </span>
        </span>
      </div>
    </div>
  );
}

type LayerGridNodeData = {
  grid: LayerGrid;
  declaredKeys: ReadonlySet<string>;
  opaqueKeys: ReadonlySet<string>;
};

/** Selection/hover state for the module list, kept off node.data to avoid
 *  recreating the React Flow node (and the flicker that causes) on every event. */
type ModuleInteraction = {
  litModules: Set<string> | null;
  selectedModule: string | null;
  onHighlightModule: (key: string | null) => void;
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
      {groupCardsByCell(data.grid.cards).map((cell) => (
        <div
          key={cell.cards[0]!.key}
          className="flex flex-col gap-3"
          style={{
            gridColumn: cell.column + 2,
            gridRow: `${cell.rowStart + 1} / span ${cell.rowSpan}`,
          }}
        >
          {cell.cards.map((card) => (
            <LayerCard
              key={card.key}
              card={card}
              declaredKeys={data.declaredKeys}
              opaqueKeys={data.opaqueKeys}
              interaction={interaction}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const layerGridNodeTypes = { 'layer-grid': LayerGridNode };

/** Sibling layers can share a (column, row) cell; group them so their cards
 *  stack inside one grid cell instead of overlapping. */
function groupCardsByCell(cards: LayerGridCard[]): Array<{
  column: number;
  rowStart: number;
  rowSpan: number;
  cards: LayerGridCard[];
}> {
  const cells = new Map<
    string,
    {
      column: number;
      rowStart: number;
      rowSpan: number;
      cards: LayerGridCard[];
    }
  >();
  for (const card of cards) {
    const key = `${card.column}:${card.rowStart}:${card.rowSpan}`;
    const cell = cells.get(key);
    if (cell) cell.cards.push(card);
    else
      cells.set(key, {
        column: card.column,
        rowStart: card.rowStart,
        rowSpan: card.rowSpan,
        cards: [card],
      });
  }
  return [...cells.values()];
}

function LayerCard({
  card,
  declaredKeys,
  opaqueKeys,
  interaction,
}: {
  card: LayerGridCard;
  declaredKeys: ReadonlySet<string>;
  opaqueKeys: ReadonlySet<string>;
  interaction: ModuleInteraction;
}) {
  const tree = useMemo(
    () => buildModuleTree(card.modules, declaredKeys),
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

      {tree.length === 0 ? (
        <div className="px-3 py-3 text-[11px] text-muted-foreground/40">
          No modules
        </div>
      ) : (
        <ModuleChips
          tree={tree}
          opaqueKeys={opaqueKeys}
          litModules={interaction.litModules}
          selectedModule={interaction.selectedModule}
          onHighlightModule={interaction.onHighlightModule}
          onSelectModule={interaction.onSelectModule}
          onHoverModule={interaction.onHoverModule}
        />
      )}
    </div>
  );
}
