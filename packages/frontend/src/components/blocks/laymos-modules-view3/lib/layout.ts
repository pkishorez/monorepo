import { Graph, layout as runDagreLayout } from '@dagrejs/dagre';
import { MarkerType, type Edge, type Node } from '@xyflow/react';

import type { ActiveModulesModel } from '../../laymos-modules/lib/connectivity';
import { moduleColors } from '../../laymos-modules/lib/colors';
import {
  moduleEdgeKey,
  type LaymosModulesModel,
  type ModuleSummary,
  type ObservedModuleEdge,
} from '../../laymos-modules/lib/model';

export interface ModuleGraphNodeData extends Record<string, unknown> {
  readonly path: string;
  readonly label: string;
  readonly layer: string;
  readonly fileCount: number;
  readonly violationCount: number;
  readonly selected: boolean;
  readonly highlighted: boolean;
  readonly related: boolean;
  readonly dimmed: boolean;
  readonly muted: boolean;
  readonly color: string;
}

export interface ModuleClusterNodeData extends Record<string, unknown> {
  readonly clusterId: string;
  readonly label: string;
  readonly layer: string;
  readonly modulePaths: readonly string[];
  readonly edgeCount: number;
  readonly selected: boolean;
  readonly related: boolean;
  readonly dimmed: boolean;
  readonly muted: boolean;
  readonly color: string;
}

export interface ModuleGraphLayout {
  readonly nodes: Node[];
  readonly edges: Edge[];
  readonly collapsedClusterCount: number;
}

interface ModuleItem {
  readonly kind: 'module';
  readonly id: string;
  readonly module: ModuleSummary;
  readonly modulePaths: readonly string[];
}

interface ClusterItem {
  readonly kind: 'cluster';
  readonly id: string;
  readonly label: string;
  readonly layer: string;
  readonly modules: readonly ModuleSummary[];
  readonly modulePaths: readonly string[];
}

type DisplayItem = ModuleItem | ClusterItem;

interface DisplayEdge {
  readonly source: string;
  readonly target: string;
  readonly moduleEdges: readonly ObservedModuleEdge[];
}

const MODULE_WIDTH = 156;
const MODULE_HEIGHT = 34;
const CLUSTER_WIDTH = 174;
const CLUSTER_HEIGHT = 44;
const CLUSTER_THRESHOLD = 10;
const CLUSTER_GROUP_MINIMUM = 4;

const layerPalette = [
  '#38bdf8',
  '#a78bfa',
  '#34d399',
  '#fb7185',
  '#fbbf24',
  '#22d3ee',
  '#c084fc',
  '#a3e635',
] as const;

function layerColor(layer: string): string {
  let hash = 0;
  for (const character of layer) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return layerPalette[hash % layerPalette.length]!;
}

function clusterFamily(module: ModuleSummary): string {
  const segments = module.label.split('/').filter(Boolean);
  return segments.length > 1 ? segments[0]! : 'modules';
}

function clusterId(layer: string, family: string): string {
  return `${layer}:${family}`;
}

function displayItems(
  model: LaymosModulesModel,
  expandedClusters: ReadonlySet<string>,
): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const layer of model.layers.values()) {
    const modules = layer.modulePaths
      .flatMap((path) => {
        const module = model.modules.get(path);
        return module ? [module] : [];
      })
      .sort((left, right) => left.label.localeCompare(right.label));
    if (modules.length <= CLUSTER_THRESHOLD) {
      items.push(
        ...modules.map(
          (module): ModuleItem => ({
            kind: 'module',
            id: `module:${module.path}`,
            module,
            modulePaths: [module.path],
          }),
        ),
      );
      continue;
    }

    const families = new Map<string, ModuleSummary[]>();
    for (const module of modules) {
      const family = clusterFamily(module);
      families.set(family, [...(families.get(family) ?? []), module]);
    }
    for (const [family, members] of families) {
      const id = clusterId(layer.name, family);
      if (members.length < CLUSTER_GROUP_MINIMUM || expandedClusters.has(id)) {
        items.push(
          ...members.map(
            (module): ModuleItem => ({
              kind: 'module',
              id: `module:${module.path}`,
              module,
              modulePaths: [module.path],
            }),
          ),
        );
        continue;
      }
      items.push({
        kind: 'cluster',
        id: `cluster:${id}`,
        label: family === 'modules' ? layer.name : family,
        layer: layer.name,
        modules: members,
        modulePaths: members.map((module) => module.path),
      });
    }
  }
  return items;
}

function displayEdges(
  model: LaymosModulesModel,
  itemByModule: ReadonlyMap<string, DisplayItem>,
): DisplayEdge[] {
  const edges = new Map<string, ObservedModuleEdge[]>();
  for (const edge of model.observedEdges) {
    const source = itemByModule.get(edge.from)?.id;
    const target = itemByModule.get(edge.to)?.id;
    if (!source || !target || source === target) continue;
    const key = moduleEdgeKey(source, target);
    edges.set(key, [...(edges.get(key) ?? []), edge]);
  }
  return [...edges.entries()].map(([key, moduleEdges]) => {
    const separator = key.indexOf('\0');
    return {
      source: key.slice(0, separator),
      target: key.slice(separator + 1),
      moduleEdges,
    };
  });
}

function itemIsRelated(item: DisplayItem, active: ActiveModulesModel): boolean {
  return (
    !active.root ||
    item.modulePaths.some((path) => active.visibleModules.has(path))
  );
}

function edgeIsVisible(edge: DisplayEdge, active: ActiveModulesModel): boolean {
  return edge.moduleEdges.some((moduleEdge) =>
    active.visibleEdgeKeys.has(moduleEdgeKey(moduleEdge.from, moduleEdge.to)),
  );
}

function edgeIsFocused(edge: DisplayEdge, active: ActiveModulesModel): boolean {
  return edge.moduleEdges.some((moduleEdge) =>
    active.focusedEdgeKeys.has(moduleEdgeKey(moduleEdge.from, moduleEdge.to)),
  );
}

function edgeTouchesModule(edge: DisplayEdge, modulePath: string): boolean {
  return edge.moduleEdges.some(
    (moduleEdge) =>
      moduleEdge.from === modulePath || moduleEdge.to === modulePath,
  );
}

function edgeColor(edge: DisplayEdge, active: ActiveModulesModel): string {
  if (edge.moduleEdges.some((moduleEdge) => moduleEdge.violating)) {
    return moduleColors.violation;
  }
  if (!active.root) return moduleColors.configured;
  if (
    edge.moduleEdges.some((moduleEdge) =>
      active.outgoingDistances.has(moduleEdge.from),
    )
  ) {
    return moduleColors.outgoing;
  }
  return moduleColors.incoming;
}

/** Builds a compact topology-first module DAG with optional population clusters. */
export function computeModuleGraphLayout(
  model: LaymosModulesModel,
  active: ActiveModulesModel,
  expandedClusters: ReadonlySet<string> = new Set(),
): ModuleGraphLayout {
  const items = displayItems(model, expandedClusters);
  const itemByModule = new Map<string, DisplayItem>();
  for (const item of items) {
    for (const path of item.modulePaths) itemByModule.set(path, item);
  }
  const graphEdges = displayEdges(model, itemByModule);
  const graph = new Graph()
    .setGraph({
      rankdir: 'TB',
      ranker: 'network-simplex',
      align: 'UL',
      nodesep: 22,
      edgesep: 10,
      ranksep: 72,
      marginx: 12,
      marginy: 12,
    })
    .setDefaultEdgeLabel(() => ({}));
  for (const item of items) {
    graph.setNode(item.id, {
      width: item.kind === 'cluster' ? CLUSTER_WIDTH : MODULE_WIDTH,
      height: item.kind === 'cluster' ? CLUSTER_HEIGHT : MODULE_HEIGHT,
    });
  }
  for (const edge of graphEdges) {
    graph.setEdge(edge.source, edge.target, {
      weight: Math.max(1, edge.moduleEdges.length),
    });
  }
  runDagreLayout(graph);

  const nodes = items.map((item): Node => {
    const position = graph.node(item.id) as { x: number; y: number };
    const related = itemIsRelated(item, active);
    const hoveredPath = active.comparison?.target;
    const highlighted = Boolean(
      hoveredPath && item.modulePaths.includes(hoveredPath),
    );
    const selected = Boolean(
      active.root && item.modulePaths.includes(active.root),
    );
    const muted = Boolean(hoveredPath && !highlighted && !selected);
    if (item.kind === 'cluster') {
      const internalEdges = model.observedEdges.filter(
        (edge) =>
          item.modulePaths.includes(edge.from) &&
          item.modulePaths.includes(edge.to),
      ).length;
      return {
        id: item.id,
        type: 'module-cluster',
        position: {
          x: position.x - CLUSTER_WIDTH / 2,
          y: position.y - CLUSTER_HEIGHT / 2,
        },
        width: CLUSTER_WIDTH,
        height: CLUSTER_HEIGHT,
        draggable: false,
        selectable: true,
        data: {
          clusterId: item.id.slice('cluster:'.length),
          label: item.label,
          layer: item.layer,
          modulePaths: item.modulePaths,
          edgeCount: internalEdges,
          selected,
          related,
          dimmed: Boolean(!hoveredPath && active.root && !related),
          muted,
          color: layerColor(item.layer),
        } satisfies ModuleClusterNodeData,
      };
    }
    const module = item.module;
    return {
      id: item.id,
      type: 'module-graph',
      position: {
        x: position.x - MODULE_WIDTH / 2,
        y: position.y - MODULE_HEIGHT / 2,
      },
      width: MODULE_WIDTH,
      height: MODULE_HEIGHT,
      draggable: false,
      selectable: true,
      data: {
        path: module.path,
        label: module.label,
        layer: module.layer,
        fileCount: module.files.length,
        violationCount: module.violationCount,
        selected,
        highlighted,
        related,
        dimmed: Boolean(!hoveredPath && active.root && !related),
        muted,
        color: layerColor(module.layer),
      } satisfies ModuleGraphNodeData,
    };
  });

  const edges = graphEdges.map((edge): Edge => {
    const visible = edgeIsVisible(edge, active);
    const hoveredPath = active.comparison?.target;
    const touchesHovered = Boolean(
      hoveredPath && edgeTouchesModule(edge, hoveredPath),
    );
    const hoverActive = touchesHovered && (!active.root || visible);
    const focused = hoverActive || edgeIsFocused(edge, active);
    const violating = edge.moduleEdges.some(
      (moduleEdge) => moduleEdge.violating,
    );
    const color = edgeColor(edge, active);
    return {
      id: `edge:${edge.source}->${edge.target}`,
      source: edge.source,
      target: edge.target,
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: 12,
        height: 12,
      },
      interactionWidth: 14,
      animated: violating && visible,
      style: {
        stroke: color,
        strokeWidth: focused ? 2.6 : visible ? 2 : 1,
        opacity: hoverActive
          ? 1
          : hoveredPath
            ? visible
              ? 0.38
              : active.root
                ? 0.06
                : 0.38
            : active.root
              ? visible
                ? 1
                : 0.06
              : 1,
        ...(violating ? { strokeDasharray: '5 3' } : {}),
      },
      zIndex: visible || focused ? 2 : 0,
      data: { moduleEdgeCount: edge.moduleEdges.length },
    };
  });

  return {
    nodes,
    edges,
    collapsedClusterCount: items.filter((item) => item.kind === 'cluster')
      .length,
  };
}
