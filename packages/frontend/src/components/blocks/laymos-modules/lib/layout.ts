import { MarkerType, type Edge, type Node } from '@xyflow/react';
import dagre from '@dagrejs/dagre';

import { moduleGraphColors } from './colors';
import type { ModuleGraphModel } from './model';
import type { ModuleGraphSelectionModel } from './selection';

export interface GraphLaneNodeData extends Record<string, unknown> {
  readonly name: string;
  readonly dimmed: boolean;
}

export interface GraphHeaderNodeData extends Record<string, unknown> {
  readonly name: string;
  readonly description?: string;
  readonly layerNames: readonly string[];
  readonly layerCount: number;
  readonly moduleCount: number;
  readonly coveredFiles: number;
  readonly totalFiles: number;
  readonly violationCount: number;
  readonly sharedLayerCount: number;
  readonly expanded: boolean;
  readonly dimmed: boolean;
}

export interface LayerContainerNodeData extends Record<string, unknown> {
  readonly name: string;
  readonly description?: string;
  readonly expanded: boolean;
  readonly graphCount: number;
  readonly moduleCount: number;
  readonly fileCount: number;
  readonly coveredFiles: number;
  readonly totalFiles: number;
  readonly violationCount: number;
  readonly hiddenConnectionCount: number;
  readonly containsSelected: boolean;
  readonly related: boolean;
  readonly dimmed: boolean;
}

export interface ModuleTileNodeData extends Record<string, unknown> {
  readonly path: string;
  readonly label: string;
  readonly isRoot: boolean;
  readonly isSink: boolean;
  readonly description?: string;
  readonly layer: string;
  readonly fileCount: number;
  readonly violationCount: number;
  readonly selected: boolean;
  readonly related: boolean;
  readonly dimmed: boolean;
  readonly quiet: boolean;
}

export interface ModuleGraphLayout {
  readonly nodes: Node[];
  readonly edges: Edge[];
}

export type ModuleLayoutMode = 'pack' | 'tree';

interface LaneGeometry {
  readonly name: string;
  readonly description?: string;
  readonly layers: readonly string[];
  readonly x: number;
  readonly width: number;
  readonly center: number;
}

interface LayerGeometry {
  readonly name: string;
  readonly rank: number;
  readonly x: number;
  readonly width: number;
  readonly height: number;
  readonly row: number;
  readonly y: number;
}

const MINIMUM_LAYER_WIDTH = 280;
const MAXIMUM_MODULE_COLUMNS = 8;
const LANE_PADDING = 28;
const LANE_GAP = 72;
const LAYER_GAP = 24;
const RANK_GAP = 88;
const RANK_ROW_GAP = 20;
const HEADER_OFFSET = 96;
const LAYER_HEADER_HEIGHT = 66;
const MODULE_WIDTH = 142;
const MODULE_HEIGHT = 36;
const MODULE_GAP = 18;
const MODULE_PADDING = 22;
const TREE_INLINE_LEVEL_LIMIT = 5;
const TREE_LEVEL_GAP = 54;

function adaptiveModuleColumns(count: number): number {
  const columnStep = MODULE_WIDTH + MODULE_GAP;
  const rowStep = MODULE_HEIGHT + MODULE_GAP;
  return Math.min(
    MAXIMUM_MODULE_COLUMNS,
    Math.max(
      count > 1 ? 2 : 1,
      Math.ceil(Math.sqrt((Math.max(1, count) * rowStep) / columnStep / 0.72)),
    ),
  );
}

function packedLayerWidth(model: ModuleGraphModel, name: string): number {
  const count = model.layers.get(name)?.modulePaths.length ?? 0;
  const columns = adaptiveModuleColumns(count);
  return Math.max(
    MINIMUM_LAYER_WIDTH,
    MODULE_PADDING * 2 + columns * MODULE_WIDTH + (columns - 1) * MODULE_GAP,
  );
}

interface TreeModuleLayout {
  readonly width: number;
  readonly height: number;
  readonly positions: ReadonlyMap<string, ModulePlacement>;
}

const treeLayoutCache = new WeakMap<
  ModuleGraphModel,
  Map<string, TreeModuleLayout>
>();

function layoutModuleTree(
  model: ModuleGraphModel,
  layerName: string,
): TreeModuleLayout {
  let cachedByLayer = treeLayoutCache.get(model);
  if (!cachedByLayer) {
    cachedByLayer = new Map();
    treeLayoutCache.set(model, cachedByLayer);
  }
  const cached = cachedByLayer.get(layerName);
  if (cached) return cached;

  const layer = model.layers.get(layerName);
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: 'TB',
    ranksep: TREE_LEVEL_GAP,
    nodesep: MODULE_GAP,
    edgesep: 12,
    acyclicer: 'greedy',
    ranker: 'network-simplex',
    marginx: MODULE_PADDING,
    marginy: MODULE_PADDING,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const path of layer?.modulePaths ?? []) {
    graph.setNode(path, { width: MODULE_WIDTH, height: MODULE_HEIGHT });
  }
  for (const edge of model.edges) {
    if (
      model.modules.get(edge.from)?.layer === layerName &&
      model.modules.get(edge.to)?.layer === layerName
    ) {
      graph.setEdge(edge.from, edge.to);
    }
  }
  dagre.layout(graph);

  const levels = Map.groupBy(layer?.modulePaths ?? [], (path) => {
    const position = graph.node(path) as { y: number };
    return position.y;
  });
  const levelDrafts = [...levels.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, paths]) => {
      const orderedPaths = [...paths].sort((left, right) => {
        const leftPosition = graph.node(left) as { x: number };
        const rightPosition = graph.node(right) as { x: number };
        return leftPosition.x - rightPosition.x;
      });
      const columns =
        paths.length <= TREE_INLINE_LEVEL_LIMIT
          ? paths.length
          : adaptiveModuleColumns(paths.length);
      const width = Math.max(
        MINIMUM_LAYER_WIDTH,
        MODULE_PADDING * 2 +
          columns * MODULE_WIDTH +
          Math.max(0, columns - 1) * MODULE_GAP,
      );
      const packing = roundedModulePacking(paths.length, width);
      return {
        paths: orderedPaths,
        width,
        placements: packing.placements,
        height: packing.height - LAYER_HEADER_HEIGHT - MODULE_PADDING * 2,
      };
    });
  const width = Math.max(
    MINIMUM_LAYER_WIDTH,
    ...levelDrafts.map((level) => level.width),
  );
  const positions = new Map<string, ModulePlacement>();
  let nextY = LAYER_HEADER_HEIGHT + MODULE_PADDING;
  for (const level of levelDrafts) {
    const horizontalOffset = (width - level.width) / 2;
    level.paths.forEach((path, index) => {
      const placement = level.placements[index]!;
      positions.set(path, {
        x: horizontalOffset + placement.x,
        y: nextY + placement.y - LAYER_HEADER_HEIGHT - MODULE_PADDING,
      });
    });
    nextY += level.height + TREE_LEVEL_GAP;
  }
  const result = {
    width,
    height:
      levelDrafts.length === 0
        ? LAYER_HEADER_HEIGHT + MODULE_PADDING * 2 + MODULE_HEIGHT
        : nextY - TREE_LEVEL_GAP + MODULE_PADDING,
    positions,
  };
  cachedByLayer.set(layerName, result);
  return result;
}

function preferredLayerWidth(
  model: ModuleGraphModel,
  name: string,
  mode: ModuleLayoutMode,
): number {
  return mode === 'tree'
    ? layoutModuleTree(model, name).width
    : packedLayerWidth(model, name);
}

function laneGeometries(
  model: ModuleGraphModel,
  mode: ModuleLayoutMode,
): LaneGeometry[] {
  const graphs =
    model.graphs.length > 0
      ? model.graphs
      : [
          {
            name: 'Modules',
            layers: [...model.layers.keys()],
            edges: [],
          },
        ];
  let nextX = 0;
  return graphs.map((graph) => {
    const exclusive = graph.layers.filter(
      (layer) => (model.layers.get(layer)?.graphs.length ?? 0) <= 1,
    );
    const widthsByRank = new Map<number, number[]>();
    for (const layer of exclusive) {
      const rank = model.layerRanks.get(layer) ?? 0;
      const widths = widthsByRank.get(rank) ?? [];
      widths.push(preferredLayerWidth(model, layer, mode));
      widthsByRank.set(rank, widths);
    }
    const widestRank = Math.max(
      MINIMUM_LAYER_WIDTH,
      ...[...widthsByRank.values()].map(
        (widths) =>
          widths.reduce((total, layerWidth) => total + layerWidth, 0) +
          Math.max(0, widths.length - 1) * LAYER_GAP,
      ),
    );
    const width = widestRank + LANE_PADDING * 2;
    const lane: LaneGeometry = {
      name: graph.name,
      layers: graph.layers,
      x: nextX,
      width,
      center: nextX + width / 2,
      ...(graph.description !== undefined
        ? { description: graph.description }
        : {}),
    };
    nextX += width + LANE_GAP;
    return lane;
  });
}

interface ModulePlacement {
  readonly x: number;
  readonly y: number;
}

function roundedModulePacking(
  count: number,
  width: number,
): {
  readonly placements: readonly ModulePlacement[];
  readonly height: number;
} {
  const maximumColumns = Math.max(
    1,
    Math.floor(
      (width - MODULE_PADDING * 2 + MODULE_GAP) / (MODULE_WIDTH + MODULE_GAP),
    ),
  );
  if (count === 0) {
    return {
      placements: [],
      height: LAYER_HEADER_HEIGHT + MODULE_PADDING * 2 + MODULE_HEIGHT,
    };
  }

  let rowCount = Math.max(1, Math.ceil(count / maximumColumns));
  let capacities: number[] = [];
  while (rowCount <= count) {
    capacities = Array.from({ length: rowCount }, (_, row) => {
      if (rowCount === 1) return maximumColumns;
      const distance = Math.abs(
        (row - (rowCount - 1) / 2) / ((rowCount - 1) / 2),
      );
      return Math.max(
        1,
        Math.round(maximumColumns * Math.sqrt(1 - distance * distance)),
      );
    });
    if (capacities.reduce((total, capacity) => total + capacity, 0) >= count) {
      break;
    }
    rowCount += 1;
  }

  const counts = Array.from({ length: rowCount }, () => 1);
  const centerFirst = [...counts.keys()].sort(
    (left, right) =>
      Math.abs(left - (rowCount - 1) / 2) -
      Math.abs(right - (rowCount - 1) / 2),
  );
  let remaining = count - rowCount;
  while (remaining > 0) {
    for (const row of centerFirst) {
      if (remaining === 0) break;
      if (counts[row]! >= capacities[row]!) continue;
      counts[row] += 1;
      remaining -= 1;
    }
  }

  const placements: ModulePlacement[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const modulesInRow = counts[row]!;
    const rowWidth =
      modulesInRow * MODULE_WIDTH + (modulesInRow - 1) * MODULE_GAP;
    const startX = (width - rowWidth) / 2;
    for (let column = 0; column < modulesInRow; column += 1) {
      placements.push({
        x: startX + column * (MODULE_WIDTH + MODULE_GAP),
        y:
          LAYER_HEADER_HEIGHT +
          MODULE_PADDING +
          row * (MODULE_HEIGHT + MODULE_GAP),
      });
    }
  }
  return {
    placements,
    height:
      LAYER_HEADER_HEIGHT +
      MODULE_PADDING * 2 +
      rowCount * MODULE_HEIGHT +
      (rowCount - 1) * MODULE_GAP,
  };
}

function layerHeight(
  model: ModuleGraphModel,
  name: string,
  width: number,
  mode: ModuleLayoutMode,
): number {
  if (mode === 'tree') return layoutModuleTree(model, name).height;
  return roundedModulePacking(
    model.layers.get(name)?.modulePaths.length ?? 0,
    width,
  ).height;
}

function layerGeometries(
  model: ModuleGraphModel,
  lanes: readonly LaneGeometry[],
  mode: ModuleLayoutMode,
): { layers: LayerGeometry[]; height: number } {
  const drafts: Omit<LayerGeometry, 'row' | 'y'>[] = [];

  for (const layer of model.layers.values()) {
    const memberLanes = lanes.filter((lane) =>
      lane.layers.includes(layer.name),
    );
    if (memberLanes.length === 0) continue;
    const rank = model.layerRanks.get(layer.name) ?? 0;
    if (memberLanes.length > 1) {
      const left = Math.min(...memberLanes.map((lane) => lane.center));
      const right = Math.max(...memberLanes.map((lane) => lane.center));
      const width = Math.max(
        preferredLayerWidth(model, layer.name, mode),
        right - left + MINIMUM_LAYER_WIDTH,
      );
      drafts.push({
        name: layer.name,
        rank,
        x: (left + right) / 2 - width / 2,
        width,
        height: layerHeight(model, layer.name, width, mode),
      });
      continue;
    }
    const lane = memberLanes[0]!;
    const siblings = [...model.layers.values()]
      .filter((candidate) => {
        const candidateLanes = lanes.filter((candidateLane) =>
          candidateLane.layers.includes(candidate.name),
        );
        return (
          candidateLanes.length === 1 &&
          candidateLanes[0]?.name === lane.name &&
          (model.layerRanks.get(candidate.name) ?? 0) === rank
        );
      })
      .sort((left, right) => left.name.localeCompare(right.name));
    const index = siblings.findIndex(
      (candidate) => candidate.name === layer.name,
    );
    const siblingWidths = siblings.map((candidate) =>
      preferredLayerWidth(model, candidate.name, mode),
    );
    const totalWidth =
      siblingWidths.reduce((total, width) => total + width, 0) +
      Math.max(0, siblings.length - 1) * LAYER_GAP;
    const width = siblingWidths[index]!;
    drafts.push({
      name: layer.name,
      rank,
      x:
        lane.center -
        totalWidth / 2 +
        siblingWidths
          .slice(0, index)
          .reduce((total, siblingWidth) => total + siblingWidth + LAYER_GAP, 0),
      width,
      height: layerHeight(model, layer.name, width, mode),
    });
  }

  const maximumRank = Math.max(0, ...drafts.map((draft) => draft.rank));
  const result: LayerGeometry[] = [];
  let rankY = HEADER_OFFSET;
  for (let rank = 0; rank <= maximumRank; rank += 1) {
    const atRank = drafts
      .filter((draft) => draft.rank === rank)
      .sort((left, right) =>
        right.width !== left.width
          ? right.width - left.width
          : left.x - right.x,
      );
    const rowEnds: number[] = [];
    const rowHeights: number[] = [];
    const assignments = atRank.map((draft) => {
      let row = rowEnds.findIndex((end) => draft.x >= end + LAYER_GAP);
      if (row === -1) row = rowEnds.length;
      rowEnds[row] = draft.x + draft.width;
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, draft.height);
      return { draft, row };
    });
    const rowOffsets = rowHeights.map((_, row) =>
      rowHeights
        .slice(0, row)
        .reduce((total, height) => total + height + RANK_ROW_GAP, 0),
    );
    for (const { draft, row } of assignments) {
      result.push({ ...draft, row, y: rankY + rowOffsets[row]! });
    }
    rankY +=
      rowHeights.reduce((total, height) => total + height, 0) +
      Math.max(0, rowHeights.length - 1) * RANK_ROW_GAP +
      RANK_GAP;
  }
  return { layers: result, height: Math.max(180, rankY - RANK_GAP + 36) };
}

function coverageTotals(
  model: ModuleGraphModel,
  layerNames: readonly string[],
): { covered: number; total: number } {
  return layerNames.reduce(
    (totals, name) => {
      const layer = model.layers.get(name);
      return {
        covered: totals.covered + (layer?.coveredFiles ?? 0),
        total: totals.total + (layer?.totalFiles ?? 0),
      };
    },
    { covered: 0, total: 0 },
  );
}

interface AggregatedEdge {
  readonly source: string;
  readonly target: string;
  readonly keys: string[];
  readonly direction: 'incoming' | 'outgoing';
  violating: boolean;
  fileCount: number;
}

/** Computes stable graph lanes, expandable layer containers, and module edges. */
export function computeModuleGraphLayout(
  model: ModuleGraphModel,
  selection: ModuleGraphSelectionModel,
  expandedLayers: ReadonlySet<string>,
  moduleLayout: ModuleLayoutMode = 'pack',
): ModuleGraphLayout {
  const lanes = laneGeometries(model, moduleLayout);
  const geometry = layerGeometries(model, lanes, moduleLayout);
  const layerGeometry = new Map(
    geometry.layers.map((layer) => [layer.name, layer]),
  );
  const nodes: Node[] = [];

  for (const lane of lanes) {
    const related = lane.layers.some((layerName) =>
      model.layers
        .get(layerName)
        ?.modulePaths.some((path) => selection.visibleModules.has(path)),
    );
    nodes.push({
      id: `lane:${lane.name}`,
      type: 'module-graph-lane',
      position: { x: lane.x, y: 0 },
      width: lane.width,
      height: geometry.height,
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -2,
      style: { pointerEvents: 'none' },
      data: {
        name: lane.name,
        dimmed: Boolean(selection.root && !related),
      } satisfies GraphLaneNodeData,
    });
    const graphLayers = lane.layers.flatMap((name) => {
      const layer = model.layers.get(name);
      return layer ? [layer] : [];
    });
    const coverage = coverageTotals(model, lane.layers);
    nodes.push({
      id: `graph:${lane.name}`,
      type: 'module-graph-header',
      position: { x: lane.center - 105, y: 18 },
      width: 210,
      height: 58,
      draggable: false,
      selectable: false,
      focusable: true,
      zIndex: 5,
      data: {
        name: lane.name,
        layerNames: lane.layers,
        layerCount: graphLayers.length,
        moduleCount: graphLayers.reduce(
          (total, layer) => total + layer.modulePaths.length,
          0,
        ),
        coveredFiles: coverage.covered,
        totalFiles: coverage.total,
        violationCount: graphLayers.reduce(
          (total, layer) => total + layer.violationCount,
          0,
        ),
        sharedLayerCount: graphLayers.filter((layer) => layer.graphs.length > 1)
          .length,
        expanded: lane.layers.some((name) => expandedLayers.has(name)),
        dimmed: Boolean(selection.root && !related),
        ...(lane.description !== undefined
          ? { description: lane.description }
          : {}),
      } satisfies GraphHeaderNodeData,
    });
  }

  for (const position of geometry.layers) {
    const layer = model.layers.get(position.name)!;
    const quietTree = moduleLayout === 'tree';
    const relatedModules = layer.modulePaths.filter((path) =>
      selection.visibleModules.has(path),
    );
    const containsSelected =
      !quietTree && layer.modulePaths.includes(selection.root ?? '');
    const related = quietTree || !selection.root || relatedModules.length > 0;
    nodes.push({
      id: `layer:${layer.name}`,
      type: 'module-layer-container',
      position: { x: position.x, y: position.y },
      width: position.width,
      height: position.height,
      draggable: false,
      selectable: false,
      focusable: true,
      zIndex: 0,
      style: { pointerEvents: 'none' },
      data: {
        name: layer.name,
        expanded: expandedLayers.has(layer.name),
        graphCount: layer.graphs.length,
        moduleCount: layer.modulePaths.length,
        fileCount: layer.fileCount,
        coveredFiles: layer.coveredFiles,
        totalFiles: layer.totalFiles,
        violationCount: layer.violationCount,
        hiddenConnectionCount:
          expandedLayers.has(layer.name) || quietTree
            ? 0
            : relatedModules.filter((path) => path !== selection.root).length,
        containsSelected,
        related,
        dimmed: Boolean(!quietTree && selection.root && !related),
        ...(layer.description !== undefined
          ? { description: layer.description }
          : {}),
      } satisfies LayerContainerNodeData,
    });

    if (!expandedLayers.has(layer.name)) continue;
    const packed =
      moduleLayout === 'pack'
        ? roundedModulePacking(layer.modulePaths.length, position.width)
        : null;
    const tree =
      moduleLayout === 'tree' ? layoutModuleTree(model, layer.name) : null;
    const treeOffset = tree ? (position.width - tree.width) / 2 : 0;
    layer.modulePaths.forEach((path, index) => {
      const module = model.modules.get(path)!;
      const relatedModule =
        !selection.root || selection.visibleModules.has(path);
      const modulePosition =
        tree?.positions.get(path) ?? packed?.placements[index];
      nodes.push({
        id: `module:${path}`,
        type: 'module-tile',
        parentId: `layer:${layer.name}`,
        extent: 'parent',
        position: {
          x: modulePosition!.x + treeOffset,
          y: modulePosition!.y,
        },
        width: MODULE_WIDTH,
        height: MODULE_HEIGHT,
        draggable: false,
        selectable: false,
        focusable: true,
        zIndex: 4,
        data: {
          path,
          label: module.label,
          isRoot: module.isRoot,
          isSink: module.isSink,
          layer: module.layer,
          fileCount: module.files.length,
          violationCount: module.violationCount,
          selected: !quietTree && selection.root === path,
          related: Boolean(!quietTree && selection.root && relatedModule),
          dimmed: Boolean(!quietTree && selection.root && !relatedModule),
          quiet: moduleLayout === 'tree',
          ...(module.description !== undefined
            ? { description: module.description }
            : {}),
        } satisfies ModuleTileNodeData,
      });
    });
  }

  const edges: Edge[] = [];
  const configuredPairs = new Set<string>();
  for (const graph of model.graphs) {
    const targets = new Set(graph.edges.map((edge) => edge.to));
    for (const layer of graph.layers.filter((name) => !targets.has(name))) {
      if (!layerGeometry.has(layer)) continue;
      edges.push({
        id: `membership:${graph.name}->${layer}`,
        source: `graph:${graph.name}`,
        target: `layer:${layer}`,
        sourceHandle: 'source-bottom',
        targetHandle: 'target-top',
        type: 'smoothstep',
        interactionWidth: 0,
        style: {
          stroke: moduleGraphColors.configured,
          strokeWidth: 1,
          strokeDasharray: '3 5',
          opacity: selection.root ? 0.06 : 0.3,
          pointerEvents: 'none',
        },
        zIndex: -1,
      });
    }
    for (const configured of graph.edges) {
      const key = `${configured.from}\0${configured.to}`;
      if (configuredPairs.has(key)) continue;
      configuredPairs.add(key);
      if (
        !layerGeometry.has(configured.from) ||
        !layerGeometry.has(configured.to)
      ) {
        continue;
      }
      edges.push({
        id: `configured:${configured.from}->${configured.to}`,
        source: `layer:${configured.from}`,
        target: `layer:${configured.to}`,
        sourceHandle: 'source-bottom',
        targetHandle: 'target-top',
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 11,
          height: 11,
          color: moduleGraphColors.configured,
        },
        interactionWidth: 0,
        style: {
          stroke: moduleGraphColors.configured,
          strokeWidth: 1.15,
          opacity: selection.root ? 0.07 : 0.58,
          pointerEvents: 'none',
        },
        zIndex: -1,
      });
    }
  }

  const aggregated = new Map<string, AggregatedEdge>();
  for (const key of selection.visibleEdges) {
    const edge = model.edgeByKey.get(key)!;
    const fromModule = model.modules.get(edge.from)!;
    const toModule = model.modules.get(edge.to)!;
    const source = expandedLayers.has(fromModule.layer)
      ? `module:${edge.from}`
      : `layer:${fromModule.layer}`;
    const target = expandedLayers.has(toModule.layer)
      ? `module:${edge.to}`
      : `layer:${toModule.layer}`;
    if (source === target) continue;
    const direction = selection.directions.get(key) ?? 'outgoing';
    const aggregateKey = `${source}\0${target}\0${direction}\0${edge.violating}`;
    const current = aggregated.get(aggregateKey) ?? {
      source,
      target,
      direction,
      keys: [],
      violating: false,
      fileCount: 0,
    };
    current.keys.push(key);
    current.violating ||= edge.violating;
    current.fileCount += edge.fileEdges.length;
    aggregated.set(aggregateKey, current);
  }

  for (const [key, edge] of aggregated) {
    const focused = edge.keys.some((edgeKey) =>
      selection.focusedEdges.has(edgeKey),
    );
    const hoverFiltering = selection.focusedEdges.size > 0;
    const color = edge.violating
      ? moduleGraphColors.violation
      : edge.direction === 'incoming'
        ? moduleGraphColors.incoming
        : moduleGraphColors.outgoing;
    const aggregatedConnection = edge.keys.length > 1;
    edges.push({
      id: `observed:${key}`,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.source.startsWith('module:')
        ? 'source-bottom'
        : 'source-bottom',
      targetHandle: edge.target.startsWith('module:')
        ? 'target-top'
        : 'target-top',
      type: 'smoothstep',
      selectable: false,
      focusable: false,
      label: aggregatedConnection ? `${edge.keys.length}` : undefined,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 13,
        height: 13,
        color,
      },
      labelStyle: {
        fill: 'white',
        fontSize: 9,
        fontWeight: 700,
        pointerEvents: 'none',
      },
      labelBgStyle: { fill: color, fillOpacity: 0.9, pointerEvents: 'none' },
      labelBgPadding: [5, 3],
      labelBgBorderRadius: 8,
      interactionWidth: 0,
      style: {
        stroke: color,
        strokeWidth: focused ? 3 : 2.2,
        strokeDasharray: edge.violating ? '6 5' : undefined,
        opacity: hoverFiltering && !focused ? 0.1 : 1,
        pointerEvents: 'none',
      },
      className: 'pointer-events-none',
      zIndex: focused ? 3 : 2,
    });
  }

  return { nodes, edges };
}
