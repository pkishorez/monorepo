import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

import type { VisualizationConfig, VizSummary } from '../types';

export type FeaturePathNodeData = {
  label: string;
  path: string;
  featureNames: string[];
  isShared: boolean;
  violationCount: number;
  isSelected: boolean;
  isDimmed: boolean;
};

export type FeatureHeaderNodeData = {
  label: string;
  featureName: string;
  description?: string;
  violationCount: number;
  isSelected: boolean;
  isDimmed: boolean;
};

export const FEATURE_NODE_WIDTH = 180;
const NODE_HEIGHT = 40;
const HEADER_HEIGHT = 30;
const HEADER_GAP = 16;
const ROW_GAP = 60;
const COL_GAP = 140;
const EDGE_COLOR = '#94a3b8';
const VIOLATION_EDGE_COLOR = '#ef4444';

function layerRankForPath(path: string, config: VisualizationConfig): number {
  let bestRank = Infinity;
  for (const stack of config.stacks) {
    for (let i = 0; i < stack.layers.length; i++) {
      if (stack.layers[i]!.paths.some((p) => path.startsWith(p))) {
        bestRank = Math.min(bestRank, i);
      }
    }
  }
  return bestRank === Infinity ? 999 : bestRank;
}

export function computeFeatureLayout(
  config: VisualizationConfig,
  summary?: VizSummary,
  selectedFeature?: string | null,
): {
  nodes: Node[];
  edges: Edge[];
} {
  const features = config.features ?? [];
  if (features.length === 0) return { nodes: [], edges: [] };

  const violationCountByFeature = new Map<string, number>();
  const violationCountByPath = new Map<string, number>();
  if (summary?.featureViolations) {
    for (const v of summary.featureViolations) {
      violationCountByFeature.set(
        v.from,
        (violationCountByFeature.get(v.from) ?? 0) + 1,
      );
      violationCountByFeature.set(
        v.to,
        (violationCountByFeature.get(v.to) ?? 0) + 1,
      );

      const fromFeature = features.find((feat) => feat.name === v.from);
      const fromPath = fromFeature?.paths.find((p) => v.fromFile.startsWith(p));
      if (fromPath) {
        violationCountByPath.set(
          fromPath,
          (violationCountByPath.get(fromPath) ?? 0) + 1,
        );
      }

      const toFeature = features.find((feat) => feat.name === v.to);
      const toPath = toFeature?.paths.find((p) => v.toFile.startsWith(p));
      if (toPath) {
        violationCountByPath.set(
          toPath,
          (violationCountByPath.get(toPath) ?? 0) + 1,
        );
      }
    }
  }

  const pathToFeatures = new Map<string, string[]>();
  for (const feat of features) {
    for (const p of feat.paths) {
      const existing = pathToFeatures.get(p);
      if (existing) existing.push(feat.name);
      else pathToFeatures.set(p, [feat.name]);
    }
  }

  const sharedPaths = new Set<string>();
  for (const [path, feats] of pathToFeatures) {
    if (feats.length > 1) sharedPaths.add(path);
  }

  const featureColumns = features.map((f) => ({
    name: f.name,
    description: f.description,
    paths: f.paths
      .filter((p) => !sharedPaths.has(p))
      .sort(
        (a, b) => layerRankForPath(a, config) - layerRankForPath(b, config),
      ),
  }));

  const featureCenterX = new Map<string, number>();
  for (let i = 0; i < featureColumns.length; i++) {
    featureCenterX.set(
      featureColumns[i]!.name,
      i * (FEATURE_NODE_WIDTH + COL_GAP),
    );
  }

  const yOffset = HEADER_HEIGHT + HEADER_GAP;
  const positions = new Map<string, { x: number; y: number }>();
  let maxExclusiveRow = 0;

  for (const col of featureColumns) {
    const cx = featureCenterX.get(col.name)!;
    for (let row = 0; row < col.paths.length; row++) {
      const nodeId = `${col.name}::${col.paths[row]!}`;
      positions.set(nodeId, {
        x: cx,
        y: yOffset + row * (NODE_HEIGHT + ROW_GAP),
      });
      maxExclusiveRow = Math.max(maxExclusiveRow, row);
    }
  }

  const sharedOrdered = [...sharedPaths].sort(
    (a, b) => layerRankForPath(a, config) - layerRankForPath(b, config),
  );

  for (let i = 0; i < sharedOrdered.length; i++) {
    const path = sharedOrdered[i]!;
    const feats = pathToFeatures.get(path)!;
    const cx =
      feats.reduce((sum, f) => sum + (featureCenterX.get(f) ?? 0), 0) /
      feats.length;
    const y = yOffset + (maxExclusiveRow + 1 + i) * (NODE_HEIGHT + ROW_GAP);
    positions.set(`shared::${path}`, { x: cx, y });
  }

  const nodes: Node[] = [];
  const hasSelection = !!selectedFeature;

  for (const col of featureColumns) {
    const cx = featureCenterX.get(col.name)!;
    const isSelected = col.name === selectedFeature;
    nodes.push({
      id: `feature-header-${col.name}`,
      type: 'featureHeader',
      position: { x: cx, y: 0 },
      width: FEATURE_NODE_WIDTH,
      height: HEADER_HEIGHT,
      data: {
        label: col.name,
        featureName: col.name,
        description: col.description,
        violationCount: violationCountByFeature.get(col.name) ?? 0,
        isSelected,
        isDimmed: hasSelection && !isSelected,
      } satisfies FeatureHeaderNodeData,
    });
  }

  for (const col of featureColumns) {
    const isFeatureSelected = col.name === selectedFeature;
    for (const path of col.paths) {
      const nodeId = `${col.name}::${path}`;
      const pos = positions.get(nodeId)!;
      nodes.push({
        id: nodeId,
        type: 'featurePath',
        position: pos,
        width: FEATURE_NODE_WIDTH,
        height: NODE_HEIGHT,
        data: {
          label: path.split('/').pop() ?? path,
          path,
          featureNames: [col.name],
          isShared: false,
          violationCount: violationCountByPath.get(path) ?? 0,
          isSelected: isFeatureSelected,
          isDimmed: hasSelection && !isFeatureSelected,
        } satisfies FeaturePathNodeData,
      });
    }
  }

  for (const path of sharedOrdered) {
    const nodeId = `shared::${path}`;
    const pos = positions.get(nodeId)!;
    const feats = pathToFeatures.get(path)!;
    const anyFeatureSelected = feats.includes(selectedFeature ?? '');
    nodes.push({
      id: nodeId,
      type: 'featurePath',
      position: pos,
      width: FEATURE_NODE_WIDTH,
      height: NODE_HEIGHT,
      data: {
        label: path.split('/').pop() ?? path,
        path,
        featureNames: feats,
        isShared: true,
        violationCount: violationCountByPath.get(path) ?? 0,
        isSelected: anyFeatureSelected,
        isDimmed: hasSelection && !anyFeatureSelected,
      } satisfies FeaturePathNodeData,
    });
  }

  const edges: Edge[] = [];
  const dimmedOpacity = 0.4;

  for (const col of featureColumns) {
    const sortedPaths = col.paths;
    const isFeatureSelected = col.name === selectedFeature;

    for (let i = 0; i < sortedPaths.length - 1; i++) {
      const fromId = `${col.name}::${sortedPaths[i]!}`;
      const toId = `${col.name}::${sortedPaths[i + 1]!}`;
      edges.push({
        id: `${fromId}->${toId}`,
        source: fromId,
        target: toId,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: EDGE_COLOR,
        },
        style: {
          stroke: EDGE_COLOR,
          strokeWidth: 1.5,
          opacity: hasSelection && !isFeatureSelected ? dimmedOpacity : 1,
        },
      });
    }

    for (const sharedPath of sharedOrdered) {
      if (
        !features.find((f) => f.name === col.name)?.paths.includes(sharedPath)
      )
        continue;

      const sharedNodeId = `shared::${sharedPath}`;
      const lastExclusive =
        sortedPaths.length > 0
          ? `${col.name}::${sortedPaths[sortedPaths.length - 1]!}`
          : null;

      if (lastExclusive) {
        edges.push({
          id: `${lastExclusive}->${sharedNodeId}`,
          source: lastExclusive,
          target: sharedNodeId,
          type: 'smoothstep',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: EDGE_COLOR,
          },
          style: {
            stroke: EDGE_COLOR,
            strokeWidth: 1.5,
            opacity:
              hasSelection && col.name !== selectedFeature ? dimmedOpacity : 1,
          },
        });
      }
    }
  }

  if (summary?.featureViolations) {
    for (const v of summary.featureViolations) {
      const fromFeature = features.find((f) => f.name === v.from);
      const toFeature = features.find((f) => f.name === v.to);
      if (!fromFeature || !toFeature) continue;

      const fromPath = fromFeature.paths.find((p) => v.fromFile.startsWith(p));
      const toPath = toFeature.paths.find((p) => v.toFile.startsWith(p));
      if (!fromPath || !toPath) continue;

      const fromNodeId = sharedPaths.has(fromPath)
        ? `shared::${fromPath}`
        : `${v.from}::${fromPath}`;
      const toNodeId = sharedPaths.has(toPath)
        ? `shared::${toPath}`
        : `${v.to}::${toPath}`;

      const edgeId = `feat-violation-${fromNodeId}->${toNodeId}`;
      if (edges.some((e) => e.id === edgeId)) continue;

      edges.push({
        id: edgeId,
        source: fromNodeId,
        target: toNodeId,
        type: 'smoothstep',
        animated: !hasSelection,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: VIOLATION_EDGE_COLOR,
        },
        style: {
          stroke: VIOLATION_EDGE_COLOR,
          strokeWidth: 2,
          strokeDasharray: '6 3',
          opacity: hasSelection ? dimmedOpacity : 1,
        },
      });
    }
  }

  return { nodes, edges };
}
