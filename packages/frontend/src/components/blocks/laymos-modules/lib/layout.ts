import { MarkerType, type Edge, type Node } from '@xyflow/react';

import type { ActiveModulesModel } from './connectivity';
import { moduleColors } from './colors';
import {
  moduleEdgeKey,
  type LaymosModulesModel,
  type ModuleSummary,
} from './model';

export interface ModuleLayerNodeData extends Record<string, unknown> {
  readonly name: string;
  readonly graphs: readonly string[];
  readonly moduleCount: number;
  readonly totalFiles: number;
  readonly coveredFiles: number;
  readonly rank: number;
  readonly dimmed: boolean;
}

export interface ModuleNodeData extends Record<string, unknown> {
  readonly path: string;
  readonly label: string;
  readonly layer: string;
  readonly fileCount: number;
  readonly violationCount: number;
  readonly selected: boolean;
  readonly comparison: boolean;
  readonly related: boolean;
  readonly dimmed: boolean;
  readonly cyclic: boolean;
}

export interface LaymosModulesFlowLayout {
  readonly nodes: Node[];
  readonly edges: Edge[];
}

const MODULE_WIDTH = 168;
const MODULE_HEIGHT = 62;
const MODULE_GAP = 20;
const MODULE_RANK_GAP = 58;
const LAYER_PADDING = 24;
const LAYER_HEADER_HEIGHT = 68;
const LAYER_GAP = 36;
const LAYER_RANK_GAP = 112;
const MAX_RANK_WIDTH = 1160;

interface PositionedModule {
  readonly module: ModuleSummary;
  readonly x: number;
  readonly y: number;
}

interface LayerBox {
  readonly name: string;
  readonly rank: number;
  readonly width: number;
  readonly height: number;
  readonly modules: readonly PositionedModule[];
  x: number;
  y: number;
}

interface StrongComponent {
  readonly members: readonly string[];
  readonly rank: number;
}

function stronglyConnectedComponents(
  paths: readonly string[],
  successors: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (path: string): void => {
    const index = nextIndex++;
    indices.set(path, index);
    lowLinks.set(path, index);
    stack.push(path);
    onStack.add(path);
    for (const next of successors.get(path) ?? []) {
      if (!paths.includes(next)) continue;
      if (!indices.has(next)) {
        visit(next);
        lowLinks.set(path, Math.min(lowLinks.get(path)!, lowLinks.get(next)!));
      } else if (onStack.has(next)) {
        lowLinks.set(path, Math.min(lowLinks.get(path)!, indices.get(next)!));
      }
    }
    if (lowLinks.get(path) !== indices.get(path)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
      if (member === path) break;
    }
    components.push(component.sort());
  };

  for (const path of paths) if (!indices.has(path)) visit(path);
  return components;
}

function rankedComponents(
  paths: readonly string[],
  successors: ReadonlyMap<string, ReadonlySet<string>>,
): StrongComponent[] {
  const components = stronglyConnectedComponents(paths, successors);
  const componentByPath = new Map<string, number>();
  components.forEach((members, index) => {
    for (const member of members) componentByPath.set(member, index);
  });
  const predecessors = new Map<number, Set<number>>(
    components.map((_, index) => [index, new Set()]),
  );
  for (const from of paths) {
    for (const to of successors.get(from) ?? []) {
      if (!componentByPath.has(to)) continue;
      const fromComponent = componentByPath.get(from)!;
      const toComponent = componentByPath.get(to)!;
      if (fromComponent !== toComponent) {
        predecessors.get(toComponent)!.add(fromComponent);
      }
    }
  }
  const ranks = new Map<number, number>();
  const rank = (component: number): number => {
    const existing = ranks.get(component);
    if (existing !== undefined) return existing;
    const incoming = predecessors.get(component)!;
    const value = incoming.size ? Math.max(...[...incoming].map(rank)) + 1 : 0;
    ranks.set(component, value);
    return value;
  };
  return components.map((members, index) => ({
    members,
    rank: rank(index),
  }));
}

function buildLayerBox(
  model: LaymosModulesModel,
  name: string,
  rank: number,
): LayerBox {
  const layer = model.layers.get(name)!;
  const components = rankedComponents(layer.modulePaths, model.successors);
  const byRank = new Map<number, string[]>();
  for (const component of components) {
    const members = byRank.get(component.rank) ?? [];
    members.push(...component.members);
    byRank.set(component.rank, members);
  }
  if (byRank.size === 0) byRank.set(0, []);
  const rows = [...byRank.entries()].sort((left, right) => left[0] - right[0]);
  const widest = Math.max(1, ...rows.map(([, paths]) => paths.length));
  const width =
    LAYER_PADDING * 2 +
    widest * MODULE_WIDTH +
    Math.max(0, widest - 1) * MODULE_GAP;
  const modules: PositionedModule[] = [];
  rows.forEach(([, paths], rowIndex) => {
    paths.sort((left, right) => left.localeCompare(right));
    const rowWidth =
      paths.length * MODULE_WIDTH + Math.max(0, paths.length - 1) * MODULE_GAP;
    paths.forEach((path, index) => {
      const module = model.modules.get(path);
      if (!module) return;
      modules.push({
        module,
        x: (width - rowWidth) / 2 + index * (MODULE_WIDTH + MODULE_GAP),
        y:
          LAYER_HEADER_HEIGHT +
          LAYER_PADDING +
          rowIndex * (MODULE_HEIGHT + MODULE_RANK_GAP),
      });
    });
  });
  const height =
    LAYER_HEADER_HEIGHT +
    LAYER_PADDING * 2 +
    Math.max(1, rows.length) * MODULE_HEIGHT +
    Math.max(0, rows.length - 1) * MODULE_RANK_GAP;
  return { name, rank, width, height, modules, x: 0, y: 0 };
}

function layerRanks(model: LaymosModulesModel): Map<string, number> {
  const predecessors = new Map<string, Set<string>>(
    [...model.layers.keys()].map((name) => [name, new Set()]),
  );
  for (const graph of model.report.architecture.graphs) {
    for (const edge of graph.edges) predecessors.get(edge.to)?.add(edge.from);
  }
  const ranks = new Map<string, number>();
  const rank = (name: string): number => {
    const existing = ranks.get(name);
    if (existing !== undefined) return existing;
    const incoming = predecessors.get(name) ?? new Set();
    const value = incoming.size ? Math.max(...[...incoming].map(rank)) + 1 : 0;
    ranks.set(name, value);
    return value;
  };
  for (const name of model.layers.keys()) rank(name);
  return ranks;
}

function positionLayerBoxes(model: LaymosModulesModel): LayerBox[] {
  const ranks = layerRanks(model);
  const boxes = [...model.layers.keys()].map((name) =>
    buildLayerBox(model, name, ranks.get(name) ?? 0),
  );
  const byRank = new Map<number, LayerBox[]>();
  for (const box of boxes) {
    const rankBoxes = byRank.get(box.rank) ?? [];
    rankBoxes.push(box);
    byRank.set(box.rank, rankBoxes);
  }
  let nextY = 0;
  for (const [, rankBoxes] of [...byRank.entries()].sort(
    (left, right) => left[0] - right[0],
  )) {
    rankBoxes.sort((left, right) => left.name.localeCompare(right.name));
    let row: LayerBox[] = [];
    let rowWidth = 0;
    let rankHeight = 0;
    const placeRow = (): void => {
      if (row.length === 0) return;
      const offset = (MAX_RANK_WIDTH - rowWidth) / 2;
      let x = offset;
      const rowHeight = Math.max(...row.map((box) => box.height));
      for (const box of row) {
        box.x = x;
        box.y = nextY + rankHeight;
        x += box.width + LAYER_GAP;
      }
      rankHeight += rowHeight + LAYER_GAP;
      row = [];
      rowWidth = 0;
    };
    for (const box of rankBoxes) {
      const candidate = rowWidth + (row.length ? LAYER_GAP : 0) + box.width;
      if (row.length && candidate > MAX_RANK_WIDTH) placeRow();
      row.push(box);
      rowWidth += (row.length > 1 ? LAYER_GAP : 0) + box.width;
    }
    placeRow();
    nextY += rankHeight - LAYER_GAP + LAYER_RANK_GAP;
  }
  return boxes;
}

function uniqueLayerEdges(model: LaymosModulesModel) {
  const pairs = new Map<string, { from: string; to: string }>();
  for (const graph of model.report.architecture.graphs) {
    for (const edge of graph.edges) {
      pairs.set(moduleEdgeKey(edge.from, edge.to), edge);
    }
  }
  return [...pairs.values()];
}

/** Converts stable compound geometry and active state into React Flow data. */
export function computeLaymosModulesFlowLayout(
  model: LaymosModulesModel,
  active: ActiveModulesModel,
): LaymosModulesFlowLayout {
  const boxes = positionLayerBoxes(model);
  const boxByName = new Map(boxes.map((box) => [box.name, box]));
  const moduleCenters = new Map<string, { x: number; y: number }>();
  for (const box of boxes) {
    for (const positioned of box.modules) {
      moduleCenters.set(positioned.module.path, {
        x: box.x + positioned.x + MODULE_WIDTH / 2,
        y: box.y + positioned.y + MODULE_HEIGHT / 2,
      });
    }
  }
  const nodes: Node[] = [];
  for (const box of boxes) {
    const layer = model.layers.get(box.name)!;
    const related =
      !active.root ||
      box.modules.some(
        ({ module }) =>
          active.visibleModules.has(module.path) ||
          active.comparison?.target === module.path,
      );
    nodes.push({
      id: `layer:${box.name}`,
      type: 'module-layer',
      position: { x: box.x, y: box.y },
      width: box.width,
      height: box.height,
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
      data: {
        name: box.name,
        graphs: layer.graphs,
        moduleCount: layer.modulePaths.length,
        totalFiles: layer.totalFiles,
        coveredFiles: layer.coveredFiles,
        rank: box.rank,
        dimmed: !related,
      } satisfies ModuleLayerNodeData,
    });
    for (const positioned of box.modules) {
      const module = positioned.module;
      const selected = active.root === module.path;
      const comparison = active.comparison?.target === module.path;
      const related = !active.root || active.visibleModules.has(module.path);
      const incoming = active.incomingDistances.has(module.path);
      const outgoing = active.outgoingDistances.has(module.path);
      nodes.push({
        id: `module:${module.path}`,
        type: 'module',
        parentId: `layer:${box.name}`,
        extent: 'parent',
        position: { x: positioned.x, y: positioned.y },
        width: MODULE_WIDTH,
        height: MODULE_HEIGHT,
        draggable: false,
        selectable: false,
        focusable: false,
        data: {
          path: module.path,
          label: module.label,
          layer: module.layer,
          fileCount: module.files.length,
          violationCount: module.violationCount,
          selected,
          comparison,
          related,
          dimmed: Boolean(active.root && !related && !comparison),
          cyclic:
            !selected && incoming && outgoing && module.path !== active.root,
        } satisfies ModuleNodeData,
      });
    }
  }

  const edges: Edge[] = uniqueLayerEdges(model).flatMap((edge) => {
    const source = boxByName.get(edge.from);
    const target = boxByName.get(edge.to);
    if (!source || !target) return [];
    return [
      {
        id: `layer:${edge.from}->${edge.to}`,
        source: `layer:${edge.from}`,
        target: `layer:${edge.to}`,
        type: 'smoothstep',
        interactionWidth: 0,
        className: 'pointer-events-none',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 10,
          height: 10,
          color: moduleColors.configured,
        },
        style: {
          stroke: moduleColors.configured,
          strokeWidth: 1,
          strokeDasharray: '3 5',
          opacity: 0.28,
          pointerEvents: 'none',
        },
        zIndex: -2,
      } satisfies Edge,
    ];
  });

  const filtering = active.focusedEdgeKeys.size > 0;
  for (const edge of model.observedEdges) {
    const key = moduleEdgeKey(edge.from, edge.to);
    if (!active.visibleEdgeKeys.has(key)) continue;
    const outgoingFrom = active.outgoingDistances.get(edge.from);
    const outgoingTo = active.outgoingDistances.get(edge.to);
    const direction =
      outgoingFrom !== undefined && outgoingTo === outgoingFrom + 1
        ? 'outgoing'
        : 'incoming';
    const focused = active.focusedEdgeKeys.has(key);
    const reciprocal = model.observedEdgeByKey.has(
      moduleEdgeKey(edge.to, edge.from),
    );
    const sourceModule = model.modules.get(edge.from)!;
    const targetModule = model.modules.get(edge.to)!;
    const sourceCenter = moduleCenters.get(edge.from)!;
    const targetCenter = moduleCenters.get(edge.to)!;
    const crossLayer = sourceModule.layer !== targetModule.layer;
    const useSideRoute = reciprocal || crossLayer;
    const side = reciprocal
      ? key.localeCompare(moduleEdgeKey(edge.to, edge.from)) < 0
        ? 'right'
        : 'left'
      : (sourceCenter.x + targetCenter.x) / 2 >= MAX_RANK_WIDTH / 2
        ? 'right'
        : 'left';
    const sourceHandle = useSideRoute
      ? `source-${side}`
      : targetCenter.y >= sourceCenter.y
        ? 'source-bottom'
        : 'source-top';
    const targetHandle = useSideRoute
      ? `target-${side}`
      : targetCenter.y >= sourceCenter.y
        ? 'target-top'
        : 'target-bottom';
    const color = edge.violating
      ? moduleColors.violation
      : direction === 'outgoing'
        ? moduleColors.outgoing
        : moduleColors.incoming;
    edges.push({
      id: `observed:${edge.from}->${edge.to}`,
      source: `module:${edge.from}`,
      target: `module:${edge.to}`,
      sourceHandle,
      targetHandle,
      type: useSideRoute ? 'bezier' : 'smoothstep',
      label:
        focused ||
        (active.depth === 'direct' &&
          (edge.from === active.root || edge.to === active.root))
          ? edge.violating
            ? 'violating import'
            : 'imports'
          : undefined,
      interactionWidth: 0,
      className: 'pointer-events-none',
      labelStyle: {
        fill: 'white',
        fontSize: 9,
        fontWeight: 700,
        opacity: filtering && !focused ? 0.1 : 1,
        pointerEvents: 'none',
      },
      labelBgStyle: {
        fill: color,
        fillOpacity: filtering && !focused ? 0.1 : 0.9,
        pointerEvents: 'none',
      },
      labelBgPadding: [5, 3],
      labelBgBorderRadius: 8,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 12,
        height: 12,
        color,
      },
      style: {
        stroke: color,
        strokeWidth: focused ? 2.75 : 2,
        strokeDasharray: edge.violating ? '6 5' : undefined,
        opacity: filtering && !focused ? 0.1 : 0.95,
        pointerEvents: 'none',
      },
      zIndex: 2,
    });
  }
  return { nodes, edges };
}
