import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';

import {
  allModules,
  featureFocus,
  resolveBreachModule,
  type ModuleNode,
  type Visibility,
  type VisualizationConfig,
  type VizSummary,
} from '../../model';

export const FEATURE_NODE_WIDTH = 220;
export const FEATURE_NODE_HEIGHT = 76;
export const MODULE_NODE_WIDTH = 184;
export const MODULE_NODE_HEIGHT = 56;

// Layout geometry for the three-axis (three-column) Features canvas.
const GROUP_PAD_X = 16;
const GROUP_PAD_TOP = 12;
const GROUP_PAD_BOTTOM = 16;
const GROUP_LABEL_H = 22;
const AXIS_GAP = 56; // gap between axis-1 (feature) and axis-2 (private modules)
const MODULE_GAP_Y = 16;
const GROUP_GAP_Y = 40; // vertical gap between stacked feature groups
const AXIS3_GAP_X = 140; // gap between feature groups column and axis-3 column
const AXIS3_CLUSTER_GAP = 48; // gap between shared cluster and public cluster
const AXIS3_LABEL_H = 22;

export type FeatureGroupNodeData = {
  name: string;
  isSelected: boolean;
  /** A feature is selected somewhere but this group is not it. */
  isDimmed: boolean;
  /** Clicking the box (not a child node) selects the whole feature. */
  onSelect: (name: string) => void;
};

export type FeatureNodeData = {
  name: string;
  description?: string;
  moduleCount: number;
  fileCount: number;
  isSelected: boolean;
  isDimmed: boolean;
  onSelect: (name: string) => void;
};

export type ModuleNodeData = {
  /** `layer::name` key, matching the canvas node id and `selectedModule`. */
  key: string;
  name: string;
  layer: string;
  visibility: Visibility;
  /** Owning feature, or null for an unowned utility. */
  feature: string | null;
  fileCount: number;
  isBreached: boolean;
  /** Owned or consumed by the selected feature (strong/secondary highlight). */
  isOwned: boolean;
  isConsumed: boolean;
  /** This module is the selected one (module-selection accent). */
  isSelected: boolean;
  /** A feature/module is selected but this module is not in focus. */
  isDimmed: boolean;
  /** Toggle module selection. */
  onSelect: (key: string) => void;
};

/**
 * Lay out the FEATURES graph along THREE AXES (columns), left -> right:
 *
 * - Axis 1: each feature's header card.
 * - Axis 2: that feature's PRIVATE modules (the ones it owns).
 *   Axis 1 + Axis 2 are wrapped in a per-feature GROUP container (a React Flow
 *   parent node) so each feature reads as an isolated unit. Groups stack
 *   vertically.
 * - Axis 3: SHARED + PUBLIC modules in a single right-hand column, shared
 *   across all features (not inside any feature box). Shared cluster above,
 *   public cluster below.
 *
 * Edges (from `summary.featureModuleEdges`, feature -> axis-3 module):
 * - `owns`: solid edge (the feature owns a shared module living in axis-3).
 * - `consumes`: muted/dashed "borrows" edge.
 * Private modules (axis-2) get NO edges — ownership is shown by containment.
 * Breaches (`summary.breaches`) render as loud red dashed edges to the resolved
 * target module (which may be a private module inside another feature's box or
 * an axis-3 module — both are valid React Flow targets).
 *
 * Selection (`selectedFeature`) accents the selected group + the axis-3 modules
 * it connects to + those edges; everything else dims via OPACITY only (no
 * relayout). Public modules are never fully dimmed.
 */
export function computeFeatureLayout(
  config: VisualizationConfig,
  summary: VizSummary | undefined,
  selectedFeature: string | null,
  selectedModule: string | null,
  onSelectFeature: (name: string) => void,
  onSelectModule: (key: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const features = config.features ?? [];
  if (features.length === 0) return { nodes: [], edges: [] };

  const featureNames = new Set(features.map((f) => f.name));
  const modules = allModules(config, summary);

  // Features connected to the selected module: either side of a
  // featureModuleEdge whose `${layer}::${module}` matches, plus the owner.
  const connectedFeatures = new Set<string>();
  if (selectedModule) {
    for (const e of summary?.featureModuleEdges ?? []) {
      if (`${e.layer}::${e.module}` === selectedModule) {
        connectedFeatures.add(e.feature);
      }
    }
    for (const m of summary?.moduleCoverage ?? []) {
      if (`${m.layer}::${m.module}` === selectedModule && m.feature) {
        connectedFeatures.add(m.feature);
      }
    }
  }

  // Partition modules: private+owner -> inside the owner's group (axis-2);
  // shared/public -> axis-3. Defensive: private but ownerless -> axis-3 + warn.
  const privateByFeature = new Map<string, ModuleNode[]>();
  const axis3: ModuleNode[] = [];
  for (const m of modules) {
    if (m.visibility === 'private') {
      if (m.feature && featureNames.has(m.feature)) {
        const list = privateByFeature.get(m.feature) ?? [];
        list.push(m);
        privateByFeature.set(m.feature, list);
      } else {
        console.warn(
          `[feature-graph] private module without resolvable owner; placing in axis-3: ${m.key}`,
        );
        axis3.push(m);
      }
    } else {
      axis3.push(m);
    }
  }

  const moduleCount = new Map<string, number>();
  const fileCount = new Map<string, number>();
  for (const m of modules) {
    if (!m.feature) continue;
    moduleCount.set(m.feature, (moduleCount.get(m.feature) ?? 0) + 1);
    fileCount.set(m.feature, (fileCount.get(m.feature) ?? 0) + m.fileCount);
  }

  const focus = selectedFeature ? featureFocus(summary, selectedFeature) : null;

  const nodes: Node[] = [];

  const moduleNode = (
    m: ModuleNode,
    position: { x: number; y: number },
    parentId?: string,
  ): Node => {
    const isOwned = focus?.owned.has(m.key) ?? false;
    const isConsumed = focus?.consumed.has(m.key) ?? false;
    const isSelected = selectedModule === m.key;
    // Module-selection dimming: every module except the selected one dims
    // (public included — the focus is on a single module, not a feature).
    const moduleDimmed = selectedModule !== null && !isSelected;
    // Feature-selection dimming: a module stays lit only when the focused
    // feature owns or actually imports it. Public/shared modules are no longer
    // exempt — an ownerless public module dims unless this feature consumes it.
    const featureDimmed = selectedFeature !== null && !isOwned && !isConsumed;
    return {
      id: `module:${m.key}`,
      type: 'module',
      position,
      width: MODULE_NODE_WIDTH,
      height: MODULE_NODE_HEIGHT,
      ...(parentId ? { parentId, extent: 'parent' as const } : {}),
      data: {
        key: m.key,
        name: m.name,
        layer: m.layer,
        visibility: m.visibility,
        feature: m.feature,
        fileCount: m.fileCount,
        isBreached: m.isBreached,
        isOwned,
        isConsumed,
        isSelected,
        isDimmed: moduleDimmed || featureDimmed,
        onSelect: onSelectModule,
      } satisfies ModuleNodeData,
    } satisfies Node;
  };

  // --- Feature groups (axis-1 + axis-2), stacked vertically. ---
  let cursorY = 0;
  let maxGroupWidth = 0;

  for (const f of features) {
    const privates = privateByFeature.get(f.name) ?? [];
    const innerW =
      GROUP_PAD_X +
      FEATURE_NODE_WIDTH +
      AXIS_GAP +
      MODULE_NODE_WIDTH +
      GROUP_PAD_X;
    const moduleColH =
      privates.length > 0
        ? privates.length * MODULE_NODE_HEIGHT +
          (privates.length - 1) * MODULE_GAP_Y
        : 0;
    const contentH = Math.max(FEATURE_NODE_HEIGHT, moduleColH);
    const groupH = GROUP_LABEL_H + GROUP_PAD_TOP + contentH + GROUP_PAD_BOTTOM;
    const groupTop = cursorY;
    maxGroupWidth = Math.max(maxGroupWidth, innerW);

    // A feature is in focus when it's the selected feature OR (in module-
    // selection mode) it's connected to the selected module.
    const isConnectedToModule = connectedFeatures.has(f.name);
    const isSelected = selectedFeature === f.name;
    const isHighlighted = isSelected || isConnectedToModule;
    const isDimmed =
      (selectedFeature !== null || selectedModule !== null) && !isHighlighted;

    nodes.push({
      id: `group:${f.name}`,
      type: 'featureGroup',
      position: { x: 0, y: groupTop },
      width: innerW,
      height: groupH,
      data: {
        name: f.name,
        isSelected: isHighlighted,
        isDimmed,
        onSelect: onSelectFeature,
      } satisfies FeatureGroupNodeData,
    } satisfies Node);

    const contentTop = GROUP_LABEL_H + GROUP_PAD_TOP;
    // Axis 1: feature header, vertically centered in the content band.
    nodes.push({
      id: `feature:${f.name}`,
      type: 'feature',
      parentId: `group:${f.name}`,
      extent: 'parent',
      position: {
        x: GROUP_PAD_X,
        y: contentTop + (contentH - FEATURE_NODE_HEIGHT) / 2,
      },
      width: FEATURE_NODE_WIDTH,
      height: FEATURE_NODE_HEIGHT,
      data: {
        name: f.name,
        description: f.description,
        moduleCount: moduleCount.get(f.name) ?? 0,
        fileCount: fileCount.get(f.name) ?? 0,
        isSelected: isHighlighted,
        isDimmed,
        onSelect: onSelectFeature,
      } satisfies FeatureNodeData,
    } satisfies Node);

    // Axis 2: private modules stacked, centered vertically.
    const moduleX = GROUP_PAD_X + FEATURE_NODE_WIDTH + AXIS_GAP;
    const moduleTop = contentTop + (contentH - moduleColH) / 2;
    privates.forEach((m, i) => {
      nodes.push(
        moduleNode(
          m,
          {
            x: moduleX,
            y: moduleTop + i * (MODULE_NODE_HEIGHT + MODULE_GAP_Y),
          },
          `group:${f.name}`,
        ),
      );
    });

    cursorY += groupH + GROUP_GAP_Y;
  }

  // --- Axis 3: shared + public column, spanning the full height. ---
  const shared = axis3.filter((m) => m.visibility === 'shared');
  const publics = axis3.filter((m) => m.visibility === 'public');
  const axis3X = maxGroupWidth + AXIS3_GAP_X;

  const placeCluster = (mods: ModuleNode[], top: number): number => {
    let y = top + AXIS3_LABEL_H;
    for (const m of mods) {
      nodes.push(moduleNode(m, { x: axis3X, y }));
      y += MODULE_NODE_HEIGHT + MODULE_GAP_Y;
    }
    return y;
  };

  if (shared.length > 0 || publics.length > 0) {
    let y = 0;
    if (shared.length > 0) {
      const end = placeCluster(shared, y);
      y = end + AXIS3_CLUSTER_GAP;
    }
    if (publics.length > 0) {
      placeCluster(publics, y);
    }
  }

  // Header labels for the axis-3 clusters (small caption nodes).
  if (shared.length > 0) {
    nodes.push(axis3Header('shared', axis3X, 0));
  }
  if (publics.length > 0) {
    const sharedBlockH =
      shared.length > 0
        ? AXIS3_LABEL_H +
          shared.length * (MODULE_NODE_HEIGHT + MODULE_GAP_Y) +
          AXIS3_CLUSTER_GAP
        : 0;
    nodes.push(axis3Header('public', axis3X, sharedBlockH));
  }

  const edges: Edge[] = [];
  const axis3Keys = new Set(axis3.map((m) => m.key));

  // featureModuleEdges: feature -> axis-3 module. owns=solid, consumes=dashed.
  for (const e of summary?.featureModuleEdges ?? []) {
    if (!featureNames.has(e.feature)) continue;
    const key = `${e.layer}::${e.module}`;
    if (!axis3Keys.has(key)) continue;
    const dimmed =
      (selectedFeature !== null && selectedFeature !== e.feature) ||
      (selectedModule !== null && selectedModule !== key);
    if (e.relation === 'owns') {
      edges.push({
        id: `owns:${e.feature}->${key}`,
        source: `group:${e.feature}`,
        target: `module:${key}`,
        type: 'smoothstep',
        hidden: dimmed,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: 'var(--foreground)',
          strokeWidth: 1.75,
          opacity: dimmed ? 0.1 : 0.7,
        },
      });
    } else {
      edges.push({
        id: `consumes:${e.feature}->${key}`,
        source: `group:${e.feature}`,
        target: `module:${key}`,
        type: 'smoothstep',
        hidden: dimmed,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: 'var(--muted-foreground)',
          strokeWidth: 1.25,
          strokeDasharray: '4 3',
          opacity: dimmed ? 0.1 : 0.5,
        },
        data: { isDimmed: dimmed },
      });
    }
  }

  // Breach edges: loud red dashed feature -> resolved module (axis-2 or axis-3).
  const seenBreach = new Set<string>();
  for (const b of summary?.breaches ?? []) {
    if (b.fromFeature === null || !featureNames.has(b.fromFeature)) continue;
    const targetKey = resolveBreachModule(
      modules,
      b.toModule,
      b.toFeature,
      b.toVisibility,
    );
    if (!targetKey) {
      console.warn(
        `[feature-graph] skipping unresolvable breach toModule="${b.toModule}" (feature=${b.toFeature ?? 'none'})`,
      );
      continue;
    }
    const id = `breach:${b.fromFeature}->${targetKey}`;
    if (seenBreach.has(id)) continue;
    seenBreach.add(id);
    const dimmed =
      (selectedFeature !== null && selectedFeature !== b.fromFeature) ||
      (selectedModule !== null && selectedModule !== targetKey);
    const labelOpacity = dimmed ? 0.2 : 1;
    edges.push({
      id,
      source: `group:${b.fromFeature}`,
      target: `module:${targetKey}`,
      type: 'smoothstep',
      hidden: dimmed,
      label: 'breach',
      labelShowBg: true,
      animated: !dimmed,
      zIndex: 10,
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--destructive)' },
      style: {
        stroke: 'var(--destructive)',
        strokeWidth: 2,
        strokeDasharray: '6 4',
        opacity: dimmed ? 0.15 : 0.95,
      },
      labelStyle: {
        fontSize: 10,
        fontWeight: 600,
        fill: 'var(--destructive)',
        opacity: labelOpacity,
      },
      labelBgStyle: { opacity: labelOpacity, fill: 'var(--card)' },
      data: { isDimmed: dimmed },
    });
  }

  return { nodes, edges };
}

export type Axis3HeaderNodeData = { label: string };

function axis3Header(label: string, x: number, y: number): Node {
  return {
    id: `axis3-header:${label}`,
    type: 'axis3Header',
    position: { x, y },
    width: MODULE_NODE_WIDTH,
    height: AXIS3_LABEL_H,
    selectable: false,
    draggable: false,
    data: { label } satisfies Axis3HeaderNodeData,
  } satisfies Node;
}

export const FEATURE_SOURCE_POSITION = Position.Right;
export const FEATURE_TARGET_POSITION = Position.Left;
