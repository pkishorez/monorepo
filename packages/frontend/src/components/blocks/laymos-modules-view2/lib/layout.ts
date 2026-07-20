import { MarkerType, type Edge, type Node } from '@xyflow/react';

import type { ActiveModulesModel } from '../../laymos-modules/lib/connectivity';
import { moduleColors } from '../../laymos-modules/lib/colors';
import {
  moduleEdgeKey,
  type LaymosModulesModel,
  type ModuleSummary,
} from '../../laymos-modules/lib/model';

export interface TreeLayerNodeData extends Record<string, unknown> {
  readonly name: string;
  readonly graphs: readonly string[];
  readonly moduleCount: number;
  readonly coveredFiles: number;
  readonly totalFiles: number;
  readonly dimmed: boolean;
}

export interface TreeFolderNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly depth: number;
  readonly dimmed: boolean;
}

export interface TreeModuleNodeData extends Record<string, unknown> {
  readonly path: string;
  readonly label: string;
  readonly layer: string;
  readonly depth: number;
  readonly fileCount: number;
  readonly violationCount: number;
  readonly selected: boolean;
  readonly related: boolean;
  readonly dimmed: boolean;
}

export interface TreeFlowLayout {
  readonly nodes: Node[];
  readonly edges: Edge[];
}

interface TreeEntry {
  readonly kind: 'folder' | 'module';
  readonly id: string;
  readonly label: string;
  readonly depth: number;
  readonly module?: ModuleSummary;
}

interface LayerBox {
  readonly name: string;
  readonly rank: number;
  readonly entries: readonly TreeEntry[];
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

const LAYER_WIDTH = 284;
const LAYER_HEADER_HEIGHT = 58;
const LAYER_PADDING = 10;
const ROW_HEIGHT = 36;
const LAYER_COLUMN_GAP = 170;
const LAYER_ROW_GAP = 28;

interface BuildFolder {
  readonly folders: Map<string, BuildFolder>;
  readonly modules: ModuleSummary[];
}

function treeEntries(modules: readonly ModuleSummary[]): TreeEntry[] {
  const root: BuildFolder = { folders: new Map(), modules: [] };
  for (const module of modules) {
    const segments = module.label.split('/').filter(Boolean);
    let folder = root;
    for (const segment of segments.slice(0, -1)) {
      const next = folder.folders.get(segment) ?? {
        folders: new Map(),
        modules: [],
      };
      folder.folders.set(segment, next);
      folder = next;
    }
    folder.modules.push(module);
  }

  const result: TreeEntry[] = [];
  const visit = (folder: BuildFolder, depth: number, prefix: string): void => {
    for (const module of [...folder.modules].sort((left, right) =>
      left.label.localeCompare(right.label),
    )) {
      result.push({
        kind: 'module',
        id: module.path,
        label: module.label.split('/').at(-1) ?? module.label,
        depth,
        module,
      });
    }
    for (const [name, child] of [...folder.folders].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const id = prefix ? `${prefix}/${name}` : name;
      result.push({ kind: 'folder', id, label: name, depth });
      visit(child, depth + 1, id);
    }
  };
  visit(root, 0, '');
  return result;
}

function layerRanks(model: LaymosModulesModel): Map<string, number> {
  const outgoing = new Map<string, Set<string>>(
    [...model.layers.keys()].map((name) => [name, new Set()]),
  );
  const incomingCount = new Map<string, number>(
    [...model.layers.keys()].map((name) => [name, 0]),
  );
  for (const graph of model.report.architecture.graphs) {
    for (const edge of graph.edges) {
      if (outgoing.get(edge.from)?.has(edge.to)) continue;
      outgoing.get(edge.from)?.add(edge.to);
      incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
    }
  }
  const ranks = new Map<string, number>(
    [...model.layers.keys()].map((name) => [name, 0]),
  );
  const queue = [...model.layers.keys()].filter(
    (name) => incomingCount.get(name) === 0,
  );
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const next of outgoing.get(current) ?? []) {
      ranks.set(
        next,
        Math.max(ranks.get(next) ?? 0, (ranks.get(current) ?? 0) + 1),
      );
      const remaining = (incomingCount.get(next) ?? 1) - 1;
      incomingCount.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  return ranks;
}

function layerBoxes(model: LaymosModulesModel): LayerBox[] {
  const ranks = layerRanks(model);
  const drafts = [...model.layers.values()].map((layer) => {
    const entries = treeEntries(
      layer.modulePaths.flatMap((path) => {
        const module = model.modules.get(path);
        return module ? [module] : [];
      }),
    );
    return {
      name: layer.name,
      rank: ranks.get(layer.name) ?? 0,
      entries,
      height:
        LAYER_HEADER_HEIGHT +
        LAYER_PADDING * 2 +
        Math.max(1, entries.length) * ROW_HEIGHT,
    };
  });
  const columns = new Map<number, typeof drafts>();
  for (const draft of drafts) {
    const column = columns.get(draft.rank) ?? [];
    column.push(draft);
    columns.set(draft.rank, column);
  }
  const result: LayerBox[] = [];
  for (const [rank, column] of columns) {
    column.sort((left, right) => left.name.localeCompare(right.name));
    let y = 0;
    for (const draft of column) {
      result.push({
        ...draft,
        x: rank * (LAYER_WIDTH + LAYER_COLUMN_GAP),
        y,
      });
      y += draft.height + LAYER_ROW_GAP;
    }
  }
  return result;
}

function edgeColor(
  from: string,
  to: string,
  active: ActiveModulesModel,
  violating: boolean,
): string {
  if (violating) return moduleColors.violation;
  if (!active.root) return moduleColors.configured;
  const fromDistance = active.outgoingDistances.get(from);
  const toDistance = active.outgoingDistances.get(to);
  if (
    fromDistance !== undefined &&
    toDistance !== undefined &&
    toDistance === fromDistance + 1
  ) {
    return moduleColors.outgoing;
  }
  return moduleColors.incoming;
}

/** Builds the left-to-right layer file-tree graph with in-place imports. */
export function computeTreeFlowLayout(
  model: LaymosModulesModel,
  active: ActiveModulesModel,
): TreeFlowLayout {
  const boxes = layerBoxes(model);
  const nodes: Node[] = [];
  for (const box of boxes) {
    const layer = model.layers.get(box.name)!;
    const layerRelated =
      !active.root ||
      layer.modulePaths.some((path) => active.visibleModules.has(path));
    nodes.push({
      id: `layer:${box.name}`,
      type: 'tree-layer',
      position: { x: box.x, y: box.y },
      width: LAYER_WIDTH,
      height: box.height,
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
      data: {
        name: box.name,
        graphs: layer.graphs,
        moduleCount: layer.modulePaths.length,
        coveredFiles: layer.coveredFiles,
        totalFiles: layer.totalFiles,
        dimmed: !layerRelated,
      } satisfies TreeLayerNodeData,
    });
    box.entries.forEach((entry, index) => {
      const y = LAYER_HEADER_HEIGHT + LAYER_PADDING + index * ROW_HEIGHT;
      if (entry.kind === 'folder') {
        nodes.push({
          id: `folder:${box.name}:${entry.id}`,
          type: 'tree-folder',
          parentId: `layer:${box.name}`,
          extent: 'parent',
          position: { x: LAYER_PADDING, y },
          width: LAYER_WIDTH - LAYER_PADDING * 2,
          height: ROW_HEIGHT,
          draggable: false,
          selectable: false,
          focusable: false,
          data: {
            label: entry.label,
            depth: entry.depth,
            dimmed: !layerRelated,
          } satisfies TreeFolderNodeData,
        });
        return;
      }
      const module = entry.module!;
      const related = !active.root || active.visibleModules.has(module.path);
      nodes.push({
        id: `module:${module.path}`,
        type: 'tree-module',
        parentId: `layer:${box.name}`,
        extent: 'parent',
        position: { x: LAYER_PADDING, y },
        width: LAYER_WIDTH - LAYER_PADDING * 2,
        height: ROW_HEIGHT,
        draggable: false,
        selectable: false,
        focusable: false,
        data: {
          path: module.path,
          label: entry.label,
          layer: module.layer,
          depth: entry.depth,
          fileCount: module.files.length,
          violationCount: module.violationCount,
          selected: active.root === module.path,
          related,
          dimmed: Boolean(active.root && !related),
        } satisfies TreeModuleNodeData,
      });
    });
  }

  const edges: Edge[] = model.observedEdges.map((edge) => {
    const key = moduleEdgeKey(edge.from, edge.to);
    const visible = active.visibleEdgeKeys.has(key);
    const focused = active.focusedEdgeKeys.has(key);
    const color = edgeColor(edge.from, edge.to, active, edge.violating);
    return {
      id: `module:${edge.from}->${edge.to}`,
      source: `module:${edge.from}`,
      target: `module:${edge.to}`,
      sourceHandle: 'source-right',
      targetHandle: 'target-left',
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: 14,
        height: 14,
      },
      interactionWidth: 12,
      animated: edge.violating && visible,
      style: {
        stroke: color,
        strokeWidth: focused ? 2.8 : visible ? 2.2 : 1,
        opacity: active.root ? (visible ? 1 : 0.055) : 0.32,
        ...(edge.violating ? { strokeDasharray: '5 3' } : {}),
      },
      zIndex: focused || visible ? 3 : 0,
    };
  });
  return { nodes, edges };
}

export interface FocusModuleNodeData extends Record<string, unknown> {
  readonly path: string;
  readonly label: string;
  readonly layer: string;
  readonly direction: 'incoming' | 'outgoing' | 'center';
  readonly distance: number;
  readonly selected: boolean;
  readonly fileCount: number;
  readonly violationCount: number;
}

/** Builds the focused dialog with consumers left and dependencies right. */
export function computeFocusFlowLayout(
  model: LaymosModulesModel,
  root: string,
  transitive: boolean,
): TreeFlowLayout {
  const queue = (adjacency: ReadonlyMap<string, ReadonlySet<string>>) => {
    const distances = new Map<string, number>([[root, 0]]);
    const paths = [root];
    for (let index = 0; index < paths.length; index += 1) {
      const current = paths[index]!;
      for (const next of adjacency.get(current) ?? []) {
        if (distances.has(next)) continue;
        distances.set(next, distances.get(current)! + 1);
        paths.push(next);
      }
    }
    return distances;
  };
  const incoming = queue(model.predecessors);
  const outgoing = queue(model.successors);
  const visible = new Map<
    string,
    { direction: 'incoming' | 'outgoing' | 'center'; distance: number }
  >();
  visible.set(root, { direction: 'center', distance: 0 });
  for (const [path, distance] of incoming) {
    if (path !== root && (transitive || distance === 1)) {
      visible.set(path, { direction: 'incoming', distance });
    }
  }
  for (const [path, distance] of outgoing) {
    if (path === root || (!transitive && distance !== 1)) continue;
    const existing = visible.get(path);
    if (!existing || distance < existing.distance) {
      visible.set(path, { direction: 'outgoing', distance });
    }
  }
  const groups = new Map<string, string[]>();
  for (const [path, placement] of visible) {
    if (placement.direction === 'center') continue;
    const key = `${placement.direction}:${placement.distance}`;
    groups.set(key, [...(groups.get(key) ?? []), path]);
  }
  const nodes: Node[] = [];
  for (const [path, placement] of visible) {
    const module = model.modules.get(path);
    if (!module) continue;
    let x = 0;
    let y = 0;
    if (placement.direction !== 'center') {
      const members = groups
        .get(`${placement.direction}:${placement.distance}`)!
        .sort();
      const index = members.indexOf(path);
      x =
        (placement.direction === 'incoming' ? -1 : 1) *
        placement.distance *
        300;
      y = (index - (members.length - 1) / 2) * 92;
    }
    nodes.push({
      id: `module:${path}`,
      type: 'focus-module',
      position: { x, y },
      width: 210,
      height: 66,
      draggable: false,
      selectable: false,
      data: {
        path,
        label: module.label,
        layer: module.layer,
        direction: placement.direction,
        distance: placement.distance,
        selected: path === root,
        fileCount: module.files.length,
        violationCount: module.violationCount,
      } satisfies FocusModuleNodeData,
    });
  }
  const visiblePaths = new Set(visible.keys());
  const edges = model.observedEdges.flatMap((edge): Edge[] => {
    if (!visiblePaths.has(edge.from) || !visiblePaths.has(edge.to)) return [];
    const from = visible.get(edge.from)!;
    const to = visible.get(edge.to)!;
    const explanatory =
      edge.from === root ||
      edge.to === root ||
      (from.direction === to.direction &&
        Math.abs(from.distance - to.distance) === 1);
    if (!explanatory) return [];
    const fromDistance = outgoing.get(edge.from);
    const toDistance = outgoing.get(edge.to);
    const direction =
      fromDistance !== undefined &&
      toDistance !== undefined &&
      toDistance === fromDistance + 1
        ? 'outgoing'
        : 'incoming';
    const color = edge.violating
      ? moduleColors.violation
      : direction === 'outgoing'
        ? moduleColors.outgoing
        : moduleColors.incoming;
    return [
      {
        id: `focus:${edge.from}->${edge.to}`,
        source: `module:${edge.from}`,
        target: `module:${edge.to}`,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 15,
          height: 15,
        },
        animated: edge.violating,
        label:
          edge.fileEdges.length > 1
            ? `${edge.fileEdges.length} imports`
            : 'imports',
        labelStyle: { fill: color, fontSize: 9, fontWeight: 600 },
        labelBgStyle: { fill: 'var(--background)', fillOpacity: 0.92 },
        style: {
          stroke: color,
          strokeWidth: 2,
          opacity: Math.max(
            0.28,
            1 - 0.2 * Math.max(from.distance, to.distance),
          ),
          ...(edge.violating ? { strokeDasharray: '5 3' } : {}),
        },
      },
    ];
  });
  return { nodes, edges };
}
