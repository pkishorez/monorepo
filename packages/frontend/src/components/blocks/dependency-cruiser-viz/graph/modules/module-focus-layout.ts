import type { ModuleEdge, VizSummary } from '../../model';
import { moduleKey } from '../../model';

export type FocusDirection = 'incoming' | 'outgoing';

export type FocusNode = {
  key: string;
  layer: string;
  name: string;
  /** BFS distance from the focused module (0 = the module itself). */
  distance: number;
  /** Which side of the focused module this node sits on. A node reachable in
   * both directions keeps the direction of its shortest distance (ties go to
   * incoming). */
  direction: FocusDirection | 'center';
  x: number;
  y: number;
  /** 1 for the center and ring 1, progressively dimmer on outer rings. */
  opacity: number;
};

export type FocusEdge = {
  id: string;
  from: string;
  to: string;
  kind: ModuleEdge['kind'];
  /** Direction relative to the focused module's neighborhood flow. */
  direction: FocusDirection;
  opacity: number;
};

export type FocusGraph = {
  center: string;
  nodes: FocusNode[];
  edges: FocusEdge[];
  /** Max distance present when transitive rings are included. */
  maxDistance: number;
};

export const RING_GAP = 260;

/** Opacity applied to a node/edge at BFS distance `d` (ring 1 stays full). */
export function dimAtDistance(distance: number): number {
  return Math.max(0.25, 1 - 0.25 * (distance - 1));
}

/**
 * BFS distances from `center` over `adjacency` (unlimited depth).
 */
function bfsDistances(
  center: string,
  adjacency: Map<string, Set<string>>,
): Map<string, number> {
  const distances = new Map<string, number>([[center, 0]]);
  const queue = [center];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const d = distances.get(current)!;
    for (const next of adjacency.get(current) ?? []) {
      if (distances.has(next)) continue;
      distances.set(next, d + 1);
      queue.push(next);
    }
  }
  distances.delete(center);
  return distances;
}

/**
 * Radial neighborhood of a focused module, derived entirely from
 * `summary.moduleEdges` (leaf out-edges are already removed at analysis time).
 *
 * Ring k = modules at BFS distance k; incoming (consumers) occupy the upper
 * semicircle, outgoing (dependencies) the lower. With `transitive: false` only
 * ring 1 (direct neighbors) is kept; an edge is kept when both endpoints are
 * visible and it either touches the center or extends a path outward along
 * its own side. Outer rings dim progressively so the direct neighborhood
 * stays the visual anchor.
 */
export function buildFocusGraph({
  center,
  moduleEdges,
  transitive,
}: {
  center: string;
  moduleEdges: VizSummary['moduleEdges'];
  transitive: boolean;
}): FocusGraph {
  const forward = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();
  const layerByKey = new Map<string, { layer: string; name: string }>();
  const edgeInfo = new Map<string, ModuleEdge['kind']>();

  const add = (map: Map<string, Set<string>>, a: string, b: string): void => {
    const set = map.get(a);
    if (set) set.add(b);
    else map.set(a, new Set([b]));
  };

  for (const e of moduleEdges) {
    const from = moduleKey(e.fromLayer, e.fromModule);
    const to = moduleKey(e.toLayer, e.toModule);
    add(forward, from, to);
    add(reverse, to, from);
    layerByKey.set(from, { layer: e.fromLayer, name: e.fromModule });
    layerByKey.set(to, { layer: e.toLayer, name: e.toModule });
    edgeInfo.set(`${from}\0${to}`, e.kind);
  }

  const downstream = bfsDistances(center, forward);
  const upstream = bfsDistances(center, reverse);

  type Placed = { key: string; distance: number; direction: FocusDirection };
  const placed = new Map<string, Placed>();
  for (const [key, distance] of upstream) {
    placed.set(key, { key, distance, direction: 'incoming' });
  }
  for (const [key, distance] of downstream) {
    const existing = placed.get(key);
    if (!existing || distance < existing.distance) {
      placed.set(key, { key, distance, direction: 'outgoing' });
    }
  }

  const kept = [...placed.values()].filter((p) =>
    transitive ? true : p.distance === 1,
  );
  const maxDistance = kept.reduce((max, p) => Math.max(max, p.distance), 0);

  // Group by (direction, distance); spread each group over its semicircle.
  const groups = new Map<string, Placed[]>();
  for (const p of kept) {
    const groupKey = `${p.direction}\0${p.distance}`;
    const list = groups.get(groupKey);
    if (list) list.push(p);
    else groups.set(groupKey, [p]);
  }

  const centerMeta = layerByKey.get(center);
  const [centerLayer = '', centerName = ''] = centerMeta
    ? [centerMeta.layer, centerMeta.name]
    : center.split('::');

  const nodes: FocusNode[] = [
    {
      key: center,
      layer: centerLayer,
      name: centerName,
      distance: 0,
      direction: 'center',
      x: 0,
      y: 0,
      opacity: 1,
    },
  ];

  for (const [groupKey, members] of groups) {
    const direction = groupKey.split('\0')[0] as FocusDirection;
    members.sort((a, b) => a.key.localeCompare(b.key));
    members.forEach((p, i) => {
      const radius = p.distance * RING_GAP;
      // Upper semicircle for incoming (angles π..2π), lower for outgoing
      // (angles 0..π); members spread evenly, inset from the horizontal axis.
      const t = (i + 1) / (members.length + 1);
      const angle =
        direction === 'incoming' ? Math.PI + t * Math.PI : t * Math.PI;
      const meta = layerByKey.get(p.key);
      const [layer = '', name = ''] = meta
        ? [meta.layer, meta.name]
        : p.key.split('::');
      nodes.push({
        key: p.key,
        layer,
        name,
        distance: p.distance,
        direction,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        opacity: dimAtDistance(p.distance),
      });
    });
  }

  const visible = new Map(nodes.map((n) => [n.key, n]));

  // Keep only edges that explain the neighborhood: those touching the center,
  // plus (transitively) those carrying a path one ring further on the same
  // side. Lateral same-ring and cross-side edges are noise here.
  const explainsNeighborhood = (fromNode: FocusNode, toNode: FocusNode) => {
    if (fromNode.direction === 'center' || toNode.direction === 'center') {
      return true;
    }
    if (fromNode.direction !== toNode.direction) return false;
    return fromNode.direction === 'outgoing'
      ? toNode.distance > fromNode.distance
      : fromNode.distance > toNode.distance;
  };

  const edges: FocusEdge[] = [];
  for (const [pair, kind] of edgeInfo) {
    const [from, to] = pair.split('\0') as [string, string];
    const fromNode = visible.get(from);
    const toNode = visible.get(to);
    if (!fromNode || !toNode) continue;
    if (!explainsNeighborhood(fromNode, toNode)) continue;
    // An edge pointing at (or away from) the center takes its direction from
    // that; between ring nodes it follows the deeper endpoint's side.
    const direction: FocusDirection =
      to === center
        ? 'incoming'
        : from === center
          ? 'outgoing'
          : fromNode.distance >= toNode.distance
            ? (fromNode.direction as FocusDirection)
            : (toNode.direction as FocusDirection);
    edges.push({
      id: pair.replace('\0', '->'),
      from,
      to,
      kind,
      direction,
      opacity: Math.min(fromNode.opacity, toNode.opacity),
    });
  }

  return { center, nodes, edges, maxDistance };
}
