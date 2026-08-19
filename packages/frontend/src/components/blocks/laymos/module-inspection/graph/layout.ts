import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';

import {
  computeLayerRanks,
  computeRanks,
  flattenRules,
  graphGroups,
  mergeConfiguredLayerEdges,
  type ConfiguredLayerEdge,
  type GraphGroup,
} from '../../architecture-graph';
import type { NamedLayerGraph } from '../../analysis-presentation';
import type { Layer, LayerRule } from '../../analysis-presentation';
import {
  moduleDependencyId,
  resolveModuleFocus,
  type ModuleFocus,
} from '../focus';
import type {
  Module,
  ModuleDependency,
  ModuleGraph,
  ModuleKind,
  ModuleViolation,
} from '../../analysis-presentation';

const moduleWidth = 184;
const moduleHeaderHeight = 58;
const bandHeaderHeight = 30;
const bandPadding = 12;
const memberRankGap = 44;

// Paint order. Edges sit below Module boxes so a line crossing the canvas is
// occluded by whatever it passes, and only a line that stops at a box connects
// to it. Violation edges stay on top: they are the thing being inspected.
const zLane = 0;
const zLayerEdge = 1;
const zLayer = 2;
const zBand = 3;
const zEdge = 4;
const zModule = 5;
const zGraphHeader = 6;
const zViolationEdge = 7;
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
  readonly isolatedLayerGraphId?: string;
  readonly modules: readonly Module[];
  readonly moduleGraphs?: readonly ModuleGraph[];
  readonly dependencies: readonly ModuleDependency[];
  readonly focusedLayerId?: string;
  readonly showLayerConnections: boolean;
  readonly showModuleConnections?: boolean;
  readonly activeModuleId?: string;
  readonly hoveredModuleId?: string;
  readonly activeViolation?: ModuleViolation;
}

interface LayerNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly changeStatus?: Module['changeStatus'];
  readonly focused: boolean;
  readonly dimmed: boolean;
  readonly softlyDimmed: boolean;
  readonly moduleCount: number;
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
  readonly changeStatus?: Module['changeStatus'];
  readonly shared: boolean;
  readonly exposed: boolean;
  readonly kind: ModuleKind;
  readonly shape: NonNullable<Module['shape']>;
  readonly member: boolean;
  readonly focused: boolean;
  readonly related: boolean;
  readonly dimmed: boolean;
  readonly softlyDimmed: boolean;
  readonly violation: boolean;
  readonly onActivate?: (moduleId: string) => void;
}

interface ModuleBandNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly description?: string;
  readonly memberCount: number;
  readonly dimmed: boolean;
  readonly violation: boolean;
}

interface UnassignedNodeData extends Record<string, unknown> {
  readonly label: string;
}

export type LayerContainerNode = Node<LayerNodeData, 'module-layer'>;
export type GraphLaneNode = Node<GraphLaneNodeData, 'module-graph-lane'>;
export type GraphHeaderNode = Node<GraphHeaderNodeData, 'module-graph-header'>;
export type ConfiguredModuleNode = Node<ModuleNodeData, 'module'>;
export type ModuleBandNode = Node<ModuleBandNodeData, 'module-band'>;
export type UnassignedFileNode = Node<UnassignedNodeData, 'unassigned-file'>;
export type ModuleGraphNode =
  | GraphLaneNode
  | GraphHeaderNode
  | LayerContainerNode
  | ModuleBandNode
  | ConfiguredModuleNode
  | UnassignedFileNode;

interface ModulePlacement {
  readonly module: Module;
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

interface BandPlacement {
  readonly graph: ModuleGraph;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface LayerGeometry {
  readonly width: number;
  readonly height: number;
  readonly contentOffset: number;
  readonly modules: readonly ModulePlacement[];
  readonly bands: readonly BandPlacement[];
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
        (input.moduleGraphs ?? []).filter(
          (graph) => graph.layerId === layer.id,
        ),
        input.dependencies,
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
  const configuredLayerEdges = mergeConfiguredLayerEdges(groups);
  const ranks = computeLayerRanks(input.layers, configuredLayerEdges);
  const geometry = equalizeLayerHeights(input.layers, ranks, packedGeometry);
  const lanes = computeGraphLanes(groups, ranks, geometry);
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  const layerPositions = layoutLayers(
    input.layers,
    groups,
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
      : selectionScope(groups, activeLayerGraphId);
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
      zIndex: zLane,
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
      zIndex: zGraphHeader,
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
    // Isolation places only the Layers it keeps, so an unplaced Layer is one
    // this view is deliberately not drawing.
    const position = layerPositions.get(layer.id);
    if (position === undefined) continue;
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
      zIndex: zLayer,
      data: {
        label: layer.id,
        ...(layer.changeStatus === undefined
          ? {}
          : { changeStatus: layer.changeStatus }),
        focused: layer.id === input.focusedLayerId,
        dimmed,
        softlyDimmed:
          hover !== undefined && !dimmed && !hover.layerIds.has(layer.id),
        moduleCount: base.modules.length,
      },
    });

    for (const band of base.bands) {
      const memberIds = new Set(band.graph.memberIds);
      nodes.push({
        id: `module-band:${band.graph.id}`,
        type: 'module-band',
        parentId: layer.id,
        extent: 'parent',
        position: { x: band.x + position.contentOffsetX, y: band.y },
        width: band.width,
        height: band.height,
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: zBand,
        style: { pointerEvents: 'none' },
        data: {
          label: band.graph.id,
          ...(band.graph.description === undefined
            ? {}
            : { description: band.graph.description }),
          memberCount: band.graph.memberIds.length,
          dimmed:
            dimmed ||
            (hasFocus &&
              ![...focus.highlightedModuleIds].some((id) => memberIds.has(id))),
          violation:
            focus.violation?.kind === 'graph-coverage' &&
            focus.violation.graphId === band.graph.id,
        },
      });
    }

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

  // Isolation drops whole Layers and their Modules, and an Edge pointing at a
  // Node that is no longer drawn breaks the canvas.
  const hidden = new Set(
    input.layers
      .filter(({ id }) => !layerPositions.has(id))
      .flatMap((layer) => [
        layer.id,
        ...input.modules
          .filter((module) => module.layerId === layer.id)
          .map(({ id }) => id),
      ]),
  );
  return {
    nodes,
    edges: [
      ...layerEdges(input, groups, configuredLayerEdges, hasFocus),
      ...graphEdges(input, focus, nodes),
    ].filter(
      ({ source, target }) => !hidden.has(source) && !hidden.has(target),
    ),
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
    zIndex: zModule,
    data: {
      label,
      ...(placement.module.changeStatus === undefined
        ? {}
        : { changeStatus: placement.module.changeStatus }),
      shared: placement.module.shared,
      exposed: placement.module.exposed,
      kind: placement.module.kind,
      shape: placement.module.shape ?? 'directory',
      member: placement.module.graphId !== undefined,
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
      onActivate,
    },
  };
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
  return [
    ...moduleGraphRuleEdges(input, focus),
    ...intraLayerRankEdges(input, focus),
    ...focus.dependencies.map((dependency) => {
      const emphasized =
        hover === undefined ||
        hover.dependencyIds.has(moduleDependencyId(dependency));
      return {
        id: moduleDependencyId(dependency),
        source: dependency.fromModuleId,
        target: dependency.toEntryPointId,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--primary)' },
        selectable: false,
        focusable: false,
        ...(emphasized ? {} : { className: 'opacity-0' }),
        style: { stroke: 'var(--primary)', strokeWidth: 2 },
        zIndex: zEdge,
      };
    }),
  ];
}

// Declared Module Graph Rules are the Graph's shape, so they stay drawn even
// when a Module is selected — dimmed when the selection is elsewhere.
function moduleGraphRuleEdges(
  input: ModuleGraphLayoutInput,
  focus: ModuleFocus,
): readonly Edge[] {
  const hasFocus =
    focus.selectedModuleId !== undefined || focus.violation !== undefined;
  return (input.moduleGraphs ?? []).flatMap((graph) =>
    graph.rules.flatMap((rule): readonly Edge[] => {
      const involved =
        focus.highlightedModuleIds.has(rule.fromModuleId) &&
        focus.highlightedModuleIds.has(rule.toModuleId);
      if (input.showModuleConnections === false && !involved) return [];
      return [
        {
          id: `module-rule:${rule.fromModuleId}->${rule.toModuleId}`,
          source: rule.fromModuleId,
          target: rule.toModuleId,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          selectable: false,
          focusable: false,
          interactionWidth: 0,
          className: 'pointer-events-none',
          style: {
            stroke: involved ? 'var(--primary)' : 'var(--muted-foreground)',
            strokeWidth: involved ? 2 : 1.5,
            strokeDasharray: '4 4',
            opacity: hasFocus && !involved ? 0.12 : 0.55,
          },
          zIndex: zEdge,
        },
      ];
    }),
  );
}

// The rank stack alone cannot say why one box is below another: a wrapped rank
// looks the same as a real dependency. These draw the imports that put it there.
function intraLayerRankEdges(
  input: ModuleGraphLayoutInput,
  focus: ModuleFocus,
): readonly Edge[] {
  const hasFocus =
    focus.selectedModuleId !== undefined || focus.violation !== undefined;
  const layerOf = new Map(
    input.modules.map(({ id, layerId }) => [id, layerId]),
  );
  const graphOf = new Map(
    input.modules.map(({ id, graphId }) => [id, graphId]),
  );
  const drawn = new Set<string>();
  return input.dependencies.flatMap(
    ({ fromModuleId, toModuleId, permitted }): readonly Edge[] => {
      const id = `module-rank:${fromModuleId}->${toModuleId}`;
      const graph = graphOf.get(fromModuleId);
      if (
        !permitted ||
        drawn.has(id) ||
        layerOf.get(fromModuleId) === undefined ||
        layerOf.get(fromModuleId) !== layerOf.get(toModuleId) ||
        // A declared Module Graph Rule already draws this pair.
        (graph !== undefined && graph === graphOf.get(toModuleId))
      ) {
        return [];
      }
      drawn.add(id);
      const involved =
        focus.highlightedModuleIds.has(fromModuleId) &&
        focus.highlightedModuleIds.has(toModuleId);
      if (input.showModuleConnections === false && !involved) return [];
      return [
        {
          id,
          source: fromModuleId,
          target: toModuleId,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          selectable: false,
          focusable: false,
          interactionWidth: 0,
          className: 'pointer-events-none',
          style: {
            stroke: involved ? 'var(--primary)' : 'var(--muted-foreground)',
            strokeWidth: involved ? 2 : 1.5,
            opacity: hasFocus && !involved ? 0.12 : 0.45,
          },
          zIndex: zEdge,
        },
      ];
    },
  );
}

function layerEdges(
  input: ModuleGraphLayoutInput,
  groups: readonly GraphGroup[],
  configuredEdges: readonly ConfiguredLayerEdge[],
  hasFocus: boolean,
): readonly Edge[] {
  const membershipEdges = groups.flatMap((group) => {
    const targets = new Set(
      flattenRules(group.rules).map(({ toLayerId }) => toLayerId),
    );
    return group.layerIds
      .filter((layerId) => !targets.has(layerId))
      .map((layerId): Edge => ({
        id: `module-graph-membership:${group.id}->${layerId}`,
        source: `module-graph-header:${group.id}`,
        target: layerId,
        sourceHandle: 'graph-source-bottom',
        targetHandle: 'layer-target-top',
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
        zIndex: zLayerEdge,
      }));
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
    return {
      id: `module-layer:${edge.graphIds.join('+')}:${edge.fromLayerId}->${edge.toLayerId}`,
      source: edge.fromLayerId,
      target: edge.toLayerId,
      sourceHandle: 'layer-source-bottom',
      targetHandle: 'layer-target-top',
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
      zIndex: zLayerEdge,
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
    type: 'smoothstep',
    style: { stroke: 'var(--destructive)', strokeWidth: 2.5 },
    zIndex: zViolationEdge,
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
    case 'unused-shared':
    case 'dead-module':
    case 'coverage':
    case 'graph-coverage':
      return [];
  }
}

type PackItem =
  | { readonly kind: 'module'; readonly module: Module }
  | {
      readonly kind: 'band';
      readonly graph: ModuleGraph;
      readonly width: number;
      readonly height: number;
      readonly members: readonly ModulePlacement[];
    };

interface Flow {
  readonly placements: readonly ModulePlacement[];
  readonly bands: readonly BandPlacement[];
  readonly width: number;
  readonly height: number;
}

function packModules(
  modules: readonly Module[],
  graphs: readonly ModuleGraph[],
  dependencies: readonly ModuleDependency[],
): LayerGeometry {
  const items: PackItem[] = [
    ...modules
      .filter(({ graphId }) => graphId === undefined)
      .map((module) => ({ kind: 'module' as const, module })),
    ...graphs.flatMap((graph) => {
      const band = bandItem(
        graph,
        modules.filter(({ graphId }) => graphId === graph.id),
      );
      return band === undefined ? [] : [band];
    }),
  ];
  if (items.length === 0) {
    return {
      width: 240,
      height: 120,
      contentOffset: 0,
      modules: [],
      bands: [],
    };
  }

  const laid = squareFlow(
    rankItems(items, intraLayerEdges(items, dependencies)),
    layerPadding,
    layerHeaderHeight + layerPadding,
  );
  return {
    width: laid.width + layerPadding * 2,
    height: layerHeaderHeight + layerPadding * 2 + laid.height,
    contentOffset: 0,
    modules: laid.placements,
    bands: laid.bands,
  };
}

function bandItem(
  graph: ModuleGraph,
  members: readonly Module[],
): PackItem | undefined {
  if (members.length === 0) return undefined;
  const memberIds = new Set(members.map(({ id }) => id));
  const laid = squareFlow(
    rankItems(
      members.map((module) => ({ kind: 'module' as const, module })),
      graph.rules
        .filter(
          ({ fromModuleId, toModuleId }) =>
            memberIds.has(fromModuleId) && memberIds.has(toModuleId),
        )
        .map(
          ({ fromModuleId, toModuleId }) => [fromModuleId, toModuleId] as const,
        ),
    ),
    bandPadding,
    bandHeaderHeight + bandPadding,
  );
  return {
    kind: 'band',
    graph,
    width: laid.width + bandPadding * 2,
    height: bandHeaderHeight + bandPadding * 2 + laid.height,
    members: laid.placements,
  };
}

// A Module Graph member never reaches outside its own Graph within the Layer,
// so a band takes the rank its members' imports of free-form Shared Modules give
// it. A violating import ranks nothing: it would draw an illegal arrangement as
// though it were the intended shape.
function intraLayerEdges(
  items: readonly PackItem[],
  dependencies: readonly ModuleDependency[],
): readonly (readonly [string, string])[] {
  const owner = new Map<string, string>();
  for (const item of items) {
    if (item.kind === 'module') {
      owner.set(item.module.id, item.module.id);
      continue;
    }
    for (const memberId of item.graph.memberIds)
      owner.set(memberId, itemId(item));
  }
  return dependencies.flatMap(({ fromModuleId, toModuleId, permitted }) => {
    const from = owner.get(fromModuleId);
    const to = owner.get(toModuleId);
    return !permitted || from === undefined || to === undefined || from === to
      ? []
      : [[from, to] as const];
  });
}

function itemId(item: PackItem): string {
  return item.kind === 'module' ? item.module.id : `band:${item.graph.id}`;
}

function itemWidth(item: PackItem): number {
  return item.kind === 'module' ? moduleWidth : item.width;
}

function itemHeight(item: PackItem): number {
  return item.kind === 'module' ? moduleHeaderHeight : item.height;
}

function rankItems(
  items: readonly PackItem[],
  edges: readonly (readonly [string, string])[],
): readonly (readonly PackItem[])[] {
  const ranks = computeRanks(items.map(itemId), edges);
  const rows = new Map<number, PackItem[]>();
  for (const item of items) {
    const rank = ranks.get(itemId(item)) ?? 0;
    rows.set(rank, [...(rows.get(rank) ?? []), item]);
  }
  return [...rows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, row]) => row);
}

// The ranks decide the height, so the width is the only thing left to choose.
// The columns that make the Layer nearest to a square win: a block twice as wide
// as it is tall costs more canvas than the rows it saves.
function squareFlow(
  ranks: readonly (readonly PackItem[])[],
  originX: number,
  originY: number,
): Flow {
  const widest = Math.max(
    1,
    ...ranks.map(
      (rank) => rank.filter((item) => item.kind === 'module').length,
    ),
  );
  let best = flow(ranks, widest, originX, originY);
  let bestRatio = aspect(best);
  for (let columns = 1; columns < widest; columns += 1) {
    const candidate = flow(ranks, columns, originX, originY);
    const ratio = aspect(candidate);
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
  }
  return best;
}

function aspect({ width, height }: Flow): number {
  if (width === 0 || height === 0) return Infinity;
  return Math.max(width, height) / Math.min(width, height);
}

function flow(
  ranks: readonly (readonly PackItem[])[],
  columns: number,
  originX: number,
  originY: number,
): Flow {
  const lines: { items: readonly PackItem[]; gapBefore: number }[] = [];
  for (const rank of ranks) {
    const rows: (readonly PackItem[])[] = [];
    const modules = rank
      .flatMap((item) => (item.kind === 'module' ? [item] : []))
      .sort((left, right) => left.module.id.localeCompare(right.module.id));
    for (let at = 0; at < modules.length; at += columns) {
      rows.push(modules.slice(at, at + columns));
    }
    // A band carries its own header and border, so a Module box tucked beside
    // one would read as being inside it.
    for (const band of rank
      .flatMap((item) => (item.kind === 'band' ? [item] : []))
      .sort((left, right) => left.graph.id.localeCompare(right.graph.id))) {
      rows.push([band]);
    }
    rows.forEach((items, index) =>
      lines.push({
        items,
        gapBefore:
          lines.length === 0 ? 0 : index === 0 ? memberRankGap : moduleGap,
      }),
    );
  }

  const lineWidth = (items: readonly PackItem[]): number =>
    items.reduce((total, item) => total + itemWidth(item), 0) +
    Math.max(0, items.length - 1) * moduleGap;
  const width = Math.max(0, ...lines.map(({ items }) => lineWidth(items)));
  const placements: ModulePlacement[] = [];
  const bands: BandPlacement[] = [];
  let y = originY;

  for (const line of lines) {
    y += line.gapBefore;
    let x = originX + (width - lineWidth(line.items)) / 2;
    for (const item of line.items) {
      if (item.kind === 'module') {
        placements.push({
          module: item.module,
          x,
          y,
          height: moduleHeaderHeight,
        });
      } else {
        bands.push({
          graph: item.graph,
          x,
          y,
          width: item.width,
          height: item.height,
        });
        for (const member of item.members) {
          placements.push({ ...member, x: x + member.x, y: y + member.y });
        }
      }
      x += itemWidth(item) + moduleGap;
    }
    y += Math.max(...line.items.map(itemHeight));
  }

  return { placements, bands, width, height: y - originY };
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

// Selecting a LayerGraph keeps the Layers it reaches lit too, so its
// dependencies stay visible instead of dimming into the lanes that host them.
function selectionScope(
  groups: readonly GraphGroup[],
  activeLayerGraphId: string,
): ReadonlySet<string> {
  const group = groups.find(({ id }) => id === activeLayerGraphId);
  return new Set([
    ...(group?.layerIds ?? []),
    ...(group?.reachedLayerIds ?? []),
  ]);
}

function computeGraphLanes(
  groups: readonly GraphGroup[],
  ranks: ReadonlyMap<string, number>,
  geometry: ReadonlyMap<string, LayerGeometry>,
): readonly GraphLane[] {
  let nextX = 0;
  return groups.map((group) => {
    const widthsByRank = new Map<number, number[]>();
    for (const layerId of group.layerIds) {
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
  ranks: ReadonlyMap<string, number>,
  geometry: ReadonlyMap<string, LayerGeometry>,
  laneById: ReadonlyMap<string, GraphLane>,
): ReadonlyMap<string, LayerPosition> {
  const positions = new Map<string, LayerPosition>();
  for (const group of groups) {
    const lane = laneById.get(group.id)!;
    const byRank = new Map<number, string[]>();
    for (const layerId of group.layerIds) {
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
