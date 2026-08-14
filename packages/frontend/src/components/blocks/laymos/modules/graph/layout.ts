import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';

import {
  computeLayerRanks,
  flattenRules,
  graphGroups,
  graphMemberships,
  mergeConfiguredLayerEdges,
  type ConfiguredLayerEdge,
  type GraphGroup,
} from '../../graph-engine';
import type { NamedLayerGraph } from '../../layers/layer-graphs';
import type { Layer, LayerRule } from '../../layers/model';
import {
  moduleDependencyId,
  resolveModuleFocus,
  type ModuleFocus,
} from '../focus';
import type {
  Module,
  ModuleDependency,
  ModuleKind,
  ModuleViolation,
} from '../model';

const moduleWidth = 184;
const moduleHeaderHeight = 58;
const nestedHeight = 38;
const nestedGap = 8;
const layerHeaderHeight = 52;
const layerPadding = 18;
const moduleGap = 16;
const unassignedHeight = 42;
const graphHeaderWidth = 184;
const graphHeaderHeight = 44;
const graphLanePadding = 32;
const graphLaneGap = 72;
const layerGap = 24;
const rankRowGap = 24;
const rankGap = 88;
const layerOffsetY = 84;

interface GraphCallbacks {
  readonly onModuleActivate?: (moduleId: string) => void;
  readonly onLayerGraphActivate?: (graphId: string) => void;
}

export interface ModuleGraphLayoutInput extends GraphCallbacks {
  readonly layers: readonly Layer[];
  readonly rules: readonly LayerRule[];
  readonly layerGraphs?: readonly NamedLayerGraph[];
  readonly activeLayerGraphId?: string;
  readonly modules: readonly Module[];
  readonly dependencies: readonly ModuleDependency[];
  readonly focusedLayerId?: string;
  readonly showLayerConnections: boolean;
  readonly activeModuleId?: string;
  readonly hoveredModuleId?: string;
  readonly activeViolation?: ModuleViolation;
}

interface LayerNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly focused: boolean;
  readonly dimmed: boolean;
  readonly softlyDimmed: boolean;
  readonly moduleCount: number;
  readonly sharedAcrossGraphs: boolean;
  readonly targetHandles: readonly { id: string; offset: number }[];
}

interface GraphLaneNodeData extends Record<string, unknown> {
  readonly dimmed: boolean;
}

interface GraphHeaderNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly description?: string;
  readonly dimmed: boolean;
  readonly active: boolean;
  readonly activatable: boolean;
}

interface ModuleNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly shared: boolean;
  readonly kind: ModuleKind;
  readonly unexposed: boolean;
  readonly focused: boolean;
  readonly related: boolean;
  readonly dimmed: boolean;
  readonly softlyDimmed: boolean;
  readonly violation: boolean;
  readonly nestedCount: number;
  readonly onActivate?: (moduleId: string) => void;
}

interface NestedNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly focused: boolean;
  readonly related: boolean;
  readonly dimmed: boolean;
  readonly softlyDimmed: boolean;
  readonly violation: boolean;
  readonly onActivate?: (moduleId: string) => void;
}

interface UnassignedNodeData extends Record<string, unknown> {
  readonly label: string;
}

export type LayerContainerNode = Node<LayerNodeData, 'module-layer'>;
export type GraphLaneNode = Node<GraphLaneNodeData, 'module-graph-lane'>;
export type GraphHeaderNode = Node<GraphHeaderNodeData, 'module-graph-header'>;
export type ConfiguredModuleNode = Node<ModuleNodeData, 'module'>;
export type NestedModuleNode = Node<NestedNodeData, 'nested-module'>;
export type UnassignedFileNode = Node<UnassignedNodeData, 'unassigned-file'>;
export type ModuleGraphNode =
  | GraphLaneNode
  | GraphHeaderNode
  | LayerContainerNode
  | ConfiguredModuleNode
  | NestedModuleNode
  | UnassignedFileNode;

interface ModulePlacement {
  readonly module: Module;
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

interface LayerGeometry {
  readonly width: number;
  readonly height: number;
  readonly contentOffset: number;
  readonly modules: readonly ModulePlacement[];
}

interface GraphLane {
  readonly id: string;
  readonly x: number;
  readonly width: number;
  readonly center: number;
}

interface LayerPosition {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly contentOffsetX: number;
}

export function layoutModuleGraph(input: ModuleGraphLayoutInput): {
  readonly nodes: readonly ModuleGraphNode[];
  readonly edges: readonly Edge[];
  readonly focus: ModuleFocus;
} {
  const focus = resolveModuleFocus(input);
  const labels = moduleLabels(input.modules);
  const packedGeometry = new Map(
    input.layers.map((layer) => [
      layer.id,
      packModules(
        input.modules.filter((module) => module.layerId === layer.id),
      ),
    ]),
  );
  if (input.activeViolation?.kind === 'coverage') {
    const base = packedGeometry.get(input.activeViolation.layerId);
    if (base !== undefined) {
      packedGeometry.set(input.activeViolation.layerId, {
        ...base,
        height: base.height + unassignedHeight + layerPadding,
      });
    }
  }
  const groups = graphGroups(input);
  const memberships = graphMemberships(groups);
  const configuredLayerEdges = mergeConfiguredLayerEdges(groups);
  const ranks = computeLayerRanks(input.layers, configuredLayerEdges);
  const geometry = equalizeLayerHeights(input.layers, ranks, packedGeometry);
  const lanes = computeGraphLanes(groups, memberships, ranks, geometry);
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  const layerPositions = layoutLayers(
    input.layers,
    groups,
    memberships,
    ranks,
    geometry,
    laneById,
  );
  const laneHeight = graphLaneHeight(layerPositions);
  const hasFocus =
    input.activeModuleId !== undefined || input.activeViolation !== undefined;
  const activeLayerGraphId = input.activeLayerGraphId;
  const selectedGraphLayerIds =
    activeLayerGraphId === undefined
      ? undefined
      : new Set(
          groups.find(({ id }) => id === activeLayerGraphId)?.layerIds ?? [],
        );
  const selectedGraphEdges =
    activeLayerGraphId === undefined
      ? configuredLayerEdges
      : configuredLayerEdges.filter(({ graphIds }) =>
          graphIds.includes(activeLayerGraphId),
        );
  const focusedLayerIds = directlyConnectedLayerIds(
    input.focusedLayerId,
    selectedGraphEdges,
  );
  const hover = resolveModuleHover(input, focus);
  const nodes: ModuleGraphNode[] = [];

  for (const group of groups) {
    const lane = laneById.get(group.id)!;
    const laneDimmed =
      activeLayerGraphId !== undefined && activeLayerGraphId !== group.id;
    nodes.push({
      id: `module-graph-lane:${group.id}`,
      type: 'module-graph-lane',
      position: { x: lane.x, y: 0 },
      width: lane.width,
      height: laneHeight,
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
      style: { pointerEvents: 'none' },
      data: { dimmed: laneDimmed },
    });
    nodes.push({
      id: `module-graph-header:${group.id}`,
      type: 'module-graph-header',
      position: {
        x: lane.center - graphHeaderWidth / 2,
        y: 18,
      },
      width: graphHeaderWidth,
      height: graphHeaderHeight,
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: 3,
      data: {
        label: group.id,
        dimmed: laneDimmed,
        active: activeLayerGraphId === group.id,
        activatable: input.onLayerGraphActivate !== undefined,
        ...(group.description === undefined
          ? {}
          : { description: group.description }),
      },
    });
  }

  for (const layer of input.layers) {
    const base = geometry.get(layer.id)!;
    const position = layerPositions.get(layer.id)!;
    const graphIds = memberships.get(layer.id) ?? [];
    const coverageViolation =
      input.activeViolation?.kind === 'coverage' &&
      input.activeViolation.layerId === layer.id
        ? input.activeViolation
        : undefined;
    const layerHighlighted = [...focus.highlightedModuleIds].some(
      (moduleId) =>
        input.modules.find((module) => module.id === moduleId)?.layerId ===
        layer.id,
    );
    const outsideSelectedGraph =
      selectedGraphLayerIds !== undefined &&
      !selectedGraphLayerIds.has(layer.id);
    const dimmed = hasFocus
      ? !layerHighlighted && coverageViolation === undefined
      : input.focusedLayerId !== undefined
        ? !focusedLayerIds.has(layer.id)
        : outsideSelectedGraph;

    nodes.push({
      id: layer.id,
      type: 'module-layer',
      position,
      width: position.width,
      height: position.height,
      draggable: false,
      selectable: false,
      focusable: false,
      data: {
        label: layer.id,
        focused: layer.id === input.focusedLayerId,
        dimmed,
        softlyDimmed:
          hover !== undefined && !dimmed && !hover.layerIds.has(layer.id),
        moduleCount: base.modules.length,
        sharedAcrossGraphs: graphIds.length > 1,
        targetHandles:
          graphIds.length < 2
            ? []
            : graphIds.flatMap((graphId) => {
                const lane = laneById.get(graphId);
                return lane === undefined
                  ? []
                  : [
                      {
                        id: `layer-target:${graphId}`,
                        offset:
                          ((lane.center - position.x) / position.width) * 100,
                      },
                    ];
              }),
      },
    });

    for (const placement of base.modules) {
      nodes.push(
        moduleNode(
          placement,
          layer.id,
          labels.get(placement.module.id) ?? placement.module.id,
          focus,
          hasFocus,
          dimmed,
          hover,
          position.contentOffsetX,
          input.onModuleActivate,
        ),
      );
      nodes.push(
        ...nestedNodes(
          placement,
          layer.id,
          focus,
          hasFocus,
          dimmed,
          hover,
          position.contentOffsetX,
          input.onModuleActivate,
        ),
      );
    }

    if (coverageViolation !== undefined) {
      nodes.push({
        id: `unassigned:${coverageViolation.id}`,
        type: 'unassigned-file',
        parentId: layer.id,
        extent: 'parent',
        position: {
          x: position.contentOffsetX + layerPadding,
          y:
            packedGeometry.get(layer.id)!.height -
            unassignedHeight -
            layerPadding / 2 +
            base.contentOffset,
        },
        width: base.width - layerPadding * 2,
        height: unassignedHeight,
        draggable: false,
        selectable: false,
        focusable: false,
        data: { label: coverageViolation.file },
      });
    }
  }

  return {
    nodes,
    edges: [
      ...layerEdges(input, groups, memberships, configuredLayerEdges, hasFocus),
      ...graphEdges(input, focus, nodes),
    ],
    focus,
  };
}

function moduleNode(
  placement: ModulePlacement,
  layerId: string,
  label: string,
  focus: ModuleFocus,
  hasFocus: boolean,
  layerDimmed: boolean,
  hover: ModuleHover | undefined,
  contentOffsetX: number,
  onActivate?: (moduleId: string) => void,
): ConfiguredModuleNode {
  const focused = focus.selectedEntryPointId === placement.module.id;
  const related = focus.highlightedModuleIds.has(placement.module.id);
  return {
    id: placement.module.id,
    type: 'module',
    parentId: layerId,
    extent: 'parent',
    position: { x: placement.x + contentOffsetX, y: placement.y },
    width: moduleWidth,
    height: placement.height,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    draggable: false,
    selectable: false,
    focusable: false,
    zIndex: 2,
    data: {
      label,
      shared: placement.module.shared,
      kind: placement.module.kind,
      unexposed: placement.module.unexposed ?? false,
      focused,
      related,
      dimmed: layerDimmed || (hasFocus && !related),
      softlyDimmed:
        hover !== undefined &&
        related &&
        !hover.moduleIds.has(placement.module.id) &&
        !focused,
      violation:
        focus.violation !== undefined &&
        focus.highlightedModuleIds.has(placement.module.id),
      nestedCount: placement.module.nested.length,
      onActivate,
    },
  };
}

function nestedNodes(
  placement: ModulePlacement,
  layerId: string,
  focus: ModuleFocus,
  hasFocus: boolean,
  layerDimmed: boolean,
  hover: ModuleHover | undefined,
  contentOffsetX: number,
  onActivate?: (moduleId: string) => void,
): readonly NestedModuleNode[] {
  return placement.module.nested.map((nested, index) => {
    const focused = focus.selectedEntryPointId === nested.id;
    const related = focus.highlightedEntryPointIds.has(nested.id);
    return {
      id: nested.id,
      type: 'nested-module',
      parentId: layerId,
      extent: 'parent',
      position: {
        x: placement.x + contentOffsetX + 12,
        y:
          placement.y + moduleHeaderHeight + index * (nestedHeight + nestedGap),
      },
      width: moduleWidth - 24,
      height: nestedHeight,
      targetPosition: Position.Left,
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: 3,
      data: {
        label: nested.path,
        focused,
        related,
        dimmed:
          layerDimmed ||
          (hasFocus &&
            !focused &&
            !related &&
            !focus.highlightedModuleIds.has(placement.module.id)),
        softlyDimmed:
          hover !== undefined &&
          related &&
          !hover.entryPointIds.has(nested.id) &&
          !focused,
        violation:
          focus.violation?.kind === 'missing-entry-point' &&
          focus.violation.entryPointId === nested.id,
        onActivate,
      },
    };
  });
}

function graphEdges(
  input: ModuleGraphLayoutInput,
  focus: ModuleFocus,
  nodes: readonly ModuleGraphNode[],
): readonly Edge[] {
  if (focus.violation !== undefined) {
    return violationEdges(focus.violation, input.dependencies, nodes);
  }

  const hover = resolveModuleHover(input, focus);
  return focus.dependencies.map((dependency) => {
    const emphasized =
      hover === undefined ||
      hover.dependencyIds.has(moduleDependencyId(dependency));
    return {
      id: moduleDependencyId(dependency),
      source: dependency.fromModuleId,
      target: dependency.toEntryPointId,
      markerEnd: { type: MarkerType.ArrowClosed },
      selectable: false,
      focusable: false,
      ...(emphasized ? {} : { className: 'opacity-0' }),
      style: { stroke: 'var(--primary)', strokeWidth: 2 },
      zIndex: 4,
    };
  });
}

function layerEdges(
  input: ModuleGraphLayoutInput,
  groups: readonly GraphGroup[],
  memberships: ReadonlyMap<string, readonly string[]>,
  configuredEdges: readonly ConfiguredLayerEdge[],
  hasFocus: boolean,
): readonly Edge[] {
  const membershipEdges = groups.flatMap((group) => {
    const targets = new Set(
      flattenRules(group.rules).map(({ toLayerId }) => toLayerId),
    );
    return group.layerIds
      .filter((layerId) => !targets.has(layerId))
      .map(
        (layerId): Edge => ({
          id: `module-graph-membership:${group.id}->${layerId}`,
          source: `module-graph-header:${group.id}`,
          target: layerId,
          sourceHandle: 'graph-source-bottom',
          targetHandle:
            (memberships.get(layerId)?.length ?? 0) > 1
              ? `layer-target:${group.id}`
              : 'layer-target-top',
          type: 'smoothstep',
          markerEnd: undefined,
          interactionWidth: 0,
          selectable: false,
          focusable: false,
          className: 'pointer-events-none',
          style: {
            stroke: 'var(--muted-foreground)',
            strokeWidth: 1,
            strokeDasharray: '3 5',
            opacity:
              hasFocus || input.focusedLayerId !== undefined
                ? 0
                : input.activeLayerGraphId === undefined ||
                    input.activeLayerGraphId === group.id
                  ? 0.3
                  : 0.06,
            pointerEvents: 'none',
          },
          zIndex: 0,
        }),
      );
  });
  if (!input.showLayerConnections) return membershipEdges;

  const configured = configuredEdges.map((edge): Edge => {
    const outsideSelectedGraph =
      input.activeLayerGraphId !== undefined &&
      !edge.graphIds.includes(input.activeLayerGraphId);
    const focused =
      !outsideSelectedGraph &&
      (input.focusedLayerId === edge.fromLayerId ||
        input.focusedLayerId === edge.toLayerId);
    const hidden = hasFocus || (input.focusedLayerId !== undefined && !focused);
    const graphId = edge.graphIds.length === 1 ? edge.graphIds[0] : undefined;
    return {
      id: `module-layer:${edge.graphIds.join('+')}:${edge.fromLayerId}->${edge.toLayerId}`,
      source: edge.fromLayerId,
      target: edge.toLayerId,
      sourceHandle: 'layer-source-bottom',
      targetHandle:
        graphId !== undefined &&
        (memberships.get(edge.toLayerId)?.length ?? 0) > 1
          ? `layer-target:${graphId}`
          : 'layer-target-top',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      interactionWidth: 0,
      selectable: false,
      focusable: false,
      className: 'pointer-events-none',
      style: {
        stroke: focused
          ? 'var(--primary)'
          : 'color-mix(in oklab, var(--muted-foreground) 55%, var(--background))',
        strokeWidth: focused ? 2 : 1.25,
        ...(hidden
          ? { opacity: 0 }
          : outsideSelectedGraph
            ? { opacity: 0.05 }
            : {}),
        pointerEvents: 'none',
      },
      zIndex: 1,
    };
  });
  return [...membershipEdges, ...configured];
}

function directlyConnectedLayerIds(
  focusedLayerId: string | undefined,
  edges: readonly ConfiguredLayerEdge[],
): ReadonlySet<string> {
  if (focusedLayerId === undefined) return new Set();
  const ids = new Set([focusedLayerId]);
  for (const edge of edges) {
    if (
      edge.fromLayerId === focusedLayerId ||
      edge.toLayerId === focusedLayerId
    ) {
      ids.add(edge.fromLayerId);
      ids.add(edge.toLayerId);
    }
  }
  return ids;
}

interface ModuleHover {
  readonly dependencyIds: ReadonlySet<string>;
  readonly moduleIds: ReadonlySet<string>;
  readonly entryPointIds: ReadonlySet<string>;
  readonly layerIds: ReadonlySet<string>;
}

function resolveModuleHover(
  input: ModuleGraphLayoutInput,
  focus: ModuleFocus,
): ModuleHover | undefined {
  if (
    input.activeModuleId === undefined ||
    input.hoveredModuleId === undefined ||
    input.activeViolation !== undefined
  ) {
    return undefined;
  }

  const dependencies = focus.dependencies.filter(
    ({ fromModuleId, toModuleId, toEntryPointId }) =>
      fromModuleId === input.hoveredModuleId ||
      toModuleId === input.hoveredModuleId ||
      toEntryPointId === input.hoveredModuleId,
  );
  if (dependencies.length === 0) return undefined;

  const moduleIds = new Set<string>([
    input.activeModuleId,
    input.hoveredModuleId,
  ]);
  if (focus.selectedModuleId !== undefined) {
    moduleIds.add(focus.selectedModuleId);
  }
  const entryPointIds = new Set<string>([
    input.activeModuleId,
    input.hoveredModuleId,
  ]);
  for (const dependency of dependencies) {
    moduleIds.add(dependency.fromModuleId);
    moduleIds.add(dependency.toModuleId);
    entryPointIds.add(dependency.toEntryPointId);
  }
  const layerIds = new Set(
    input.modules
      .filter(({ id }) => moduleIds.has(id))
      .map(({ layerId }) => layerId),
  );

  return {
    dependencyIds: new Set(dependencies.map(moduleDependencyId)),
    moduleIds,
    entryPointIds,
    layerIds,
  };
}

function violationEdges(
  violation: ModuleViolation,
  dependencies: readonly ModuleDependency[],
  nodes: readonly ModuleGraphNode[],
): readonly Edge[] {
  const nodeIds = new Set(nodes.map(({ id }) => id));
  const edge = (id: string, source: string, target: string): Edge => ({
    id,
    source,
    target,
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--destructive)' },
    selectable: false,
    focusable: false,
    style: { stroke: 'var(--destructive)', strokeWidth: 2.5 },
    zIndex: 5,
  });

  switch (violation.kind) {
    case 'dependency':
    case 'boundary':
      return nodeIds.has(violation.fromModuleId) &&
        nodeIds.has(violation.toModuleId)
        ? [
            edge(
              `violation:${violation.id}`,
              violation.fromModuleId,
              violation.toModuleId,
            ),
          ]
        : [];
    case 'cycle': {
      const cycleIds = new Set(violation.moduleIds);
      return dependencies
        .filter(
          ({ fromModuleId, toModuleId }) =>
            cycleIds.has(fromModuleId) && cycleIds.has(toModuleId),
        )
        .map((dependency) =>
          edge(
            `violation:${violation.id}:${moduleDependencyId(dependency)}`,
            dependency.fromModuleId,
            dependency.toEntryPointId,
          ),
        );
    }
    case 'missing-entry-point':
    case 'coverage':
      return [];
  }
}

function packModules(modules: readonly Module[]): LayerGeometry {
  if (modules.length === 0) {
    return { width: 240, height: 120, contentOffset: 0, modules: [] };
  }

  const columns = Math.ceil(Math.sqrt(modules.length));
  const rows = Array.from(
    { length: Math.ceil(modules.length / columns) },
    (_, row) => modules.slice(row * columns, (row + 1) * columns),
  );
  const rowHeights = rows.map((row) =>
    Math.max(...row.map((module) => configuredModuleHeight(module))),
  );
  const placements: ModulePlacement[] = [];
  let y = layerHeaderHeight + layerPadding;

  rows.forEach((row, rowIndex) => {
    row.forEach((module, columnIndex) => {
      placements.push({
        module,
        x: layerPadding + columnIndex * (moduleWidth + moduleGap),
        y,
        height: configuredModuleHeight(module),
      });
    });
    y += rowHeights[rowIndex]! + moduleGap;
  });

  return {
    width: layerPadding * 2 + columns * moduleWidth + (columns - 1) * moduleGap,
    height: y - moduleGap + layerPadding,
    contentOffset: 0,
    modules: placements,
  };
}

function configuredModuleHeight(module: Module): number {
  return (
    moduleHeaderHeight +
    module.nested.length * nestedHeight +
    Math.max(0, module.nested.length - 1) * nestedGap +
    (module.nested.length === 0 ? 0 : 12)
  );
}

function equalizeLayerHeights(
  layers: readonly Layer[],
  ranks: ReadonlyMap<string, number>,
  geometry: ReadonlyMap<string, LayerGeometry>,
): ReadonlyMap<string, LayerGeometry> {
  const heightByRank = new Map<number, number>();

  for (const layer of layers) {
    const rank = ranks.get(layer.id) ?? 0;
    heightByRank.set(
      rank,
      Math.max(heightByRank.get(rank) ?? 0, geometry.get(layer.id)!.height),
    );
  }

  return new Map(
    layers.map((layer) => {
      const base = geometry.get(layer.id)!;
      const rank = ranks.get(layer.id) ?? 0;
      const height = heightByRank.get(rank)!;
      const offset = (height - base.height) / 2;
      return [
        layer.id,
        {
          ...base,
          height,
          contentOffset: base.contentOffset + offset,
          modules: base.modules.map((placement) => ({
            ...placement,
            y: placement.y + offset,
          })),
        },
      ];
    }),
  );
}

function computeGraphLanes(
  groups: readonly GraphGroup[],
  memberships: ReadonlyMap<string, readonly string[]>,
  ranks: ReadonlyMap<string, number>,
  geometry: ReadonlyMap<string, LayerGeometry>,
): readonly GraphLane[] {
  let nextX = 0;
  return groups.map((group) => {
    const widthsByRank = new Map<number, number[]>();
    for (const layerId of group.layerIds) {
      if ((memberships.get(layerId)?.length ?? 0) > 1) continue;
      const rank = ranks.get(layerId) ?? 0;
      const widths = widthsByRank.get(rank) ?? [];
      widths.push(geometry.get(layerId)?.width ?? 240);
      widthsByRank.set(rank, widths);
    }
    const widestRank = Math.max(
      240,
      ...[...widthsByRank.values()].map(
        (widths) =>
          widths.reduce((total, width) => total + width, 0) +
          Math.max(0, widths.length - 1) * layerGap,
      ),
    );
    const width = widestRank + graphLanePadding * 2;
    const lane = {
      id: group.id,
      x: nextX,
      width,
      center: nextX + width / 2,
    };
    nextX += width + graphLaneGap;
    return lane;
  });
}

function layoutLayers(
  layers: readonly Layer[],
  groups: readonly GraphGroup[],
  memberships: ReadonlyMap<string, readonly string[]>,
  ranks: ReadonlyMap<string, number>,
  geometry: ReadonlyMap<string, LayerGeometry>,
  laneById: ReadonlyMap<string, GraphLane>,
): ReadonlyMap<string, LayerPosition> {
  const positions = new Map<string, LayerPosition>();
  for (const group of groups) {
    const lane = laneById.get(group.id)!;
    const byRank = new Map<number, string[]>();
    for (const layerId of group.layerIds) {
      if ((memberships.get(layerId)?.length ?? 0) > 1) continue;
      const rank = ranks.get(layerId) ?? 0;
      const siblings = byRank.get(rank) ?? [];
      siblings.push(layerId);
      byRank.set(rank, siblings);
    }
    for (const [rank, siblings] of byRank) {
      const totalWidth =
        siblings.reduce(
          (total, layerId) => total + geometry.get(layerId)!.width,
          0,
        ) +
        Math.max(0, siblings.length - 1) * layerGap;
      let nextX = lane.center - totalWidth / 2;
      for (const layerId of siblings) {
        const base = geometry.get(layerId)!;
        positions.set(layerId, {
          x: nextX,
          y: layerOffsetY + rank * (base.height + rankGap),
          width: base.width,
          height: base.height,
          contentOffsetX: 0,
        });
        nextX += base.width + layerGap;
      }
    }
  }

  for (const layer of layers) {
    const graphIds = memberships.get(layer.id) ?? [];
    if (graphIds.length < 2) continue;
    const memberLanes = graphIds.flatMap((id) => {
      const lane = laneById.get(id);
      return lane === undefined ? [] : [lane];
    });
    const base = geometry.get(layer.id)!;
    const left = Math.min(...memberLanes.map(({ center }) => center));
    const right = Math.max(...memberLanes.map(({ center }) => center));
    const width = right - left + base.width;
    positions.set(layer.id, {
      x: left - base.width / 2,
      y: layerOffsetY + (ranks.get(layer.id) ?? 0) * (base.height + rankGap),
      width,
      height: base.height,
      contentOffsetX: (width - base.width) / 2,
    });
  }

  let nextRankY = layerOffsetY;
  const maxRank = Math.max(0, ...ranks.values());
  for (let rank = 0; rank <= maxRank; rank += 1) {
    const layersAtRank = layers
      .filter((layer) => (ranks.get(layer.id) ?? 0) === rank)
      .flatMap((layer) => {
        const position = positions.get(layer.id);
        return position === undefined ? [] : [{ layer, position }];
      })
      .sort(
        (left, right) =>
          left.position.x - right.position.x ||
          right.position.width - left.position.width,
      );
    const rowEnds: number[] = [];
    const rankHeight = Math.max(
      120,
      ...layersAtRank.map(({ position }) => position.height),
    );
    for (const { layer, position } of layersAtRank) {
      let row = rowEnds.findIndex((end) => position.x >= end + layerGap);
      if (row === -1) row = rowEnds.length;
      rowEnds[row] = position.x + position.width;
      positions.set(layer.id, {
        ...position,
        y: nextRankY + row * (rankHeight + rankRowGap),
      });
    }
    const rowCount = Math.max(1, rowEnds.length);
    nextRankY += rowCount * rankHeight + (rowCount - 1) * rankRowGap + rankGap;
  }
  return positions;
}

function graphLaneHeight(
  positions: ReadonlyMap<string, LayerPosition>,
): number {
  return (
    Math.max(
      layerOffsetY,
      ...[...positions.values()].map(({ y, height }) => y + height),
    ) + 36
  );
}

function moduleLabels(modules: readonly Module[]): ReadonlyMap<string, string> {
  return new Map(
    modules.map((module) => {
      const segments = module.id.split('/');
      for (let length = 1; length <= segments.length; length += 1) {
        const label = segments.slice(-length).join('/');
        const unique = modules.every(
          (candidate) =>
            candidate.id === module.id ||
            candidate.id.split('/').slice(-length).join('/') !== label,
        );
        if (unique) return [module.id, label];
      }
      return [module.id, module.id];
    }),
  );
}
