import { describe, expect, test } from 'vitest';

import type { ModuleEdge } from '../../model';
import {
  buildFocusGraph,
  dimAtDistance,
  RING_GAP,
} from './module-focus-layout';

const edge = (
  fromLayer: string,
  fromModule: string,
  toLayer: string,
  toModule: string,
  kind: ModuleEdge['kind'] = 'legal',
): ModuleEdge => ({ fromLayer, fromModule, toLayer, toModule, kind });

// a → center → b → c ; d → a (two hops upstream of center)
const EDGES: ModuleEdge[] = [
  edge('l1', 'a', 'l2', 'center'),
  edge('l0', 'd', 'l1', 'a'),
  edge('l2', 'center', 'l3', 'b'),
  edge('l3', 'b', 'l4', 'c', 'breach'),
];

describe('buildFocusGraph', () => {
  test('direct-only keeps ring 1 both directions', () => {
    const g = buildFocusGraph({
      center: 'l2::center',
      moduleEdges: EDGES,
      transitive: false,
    });
    const keys = g.nodes.map((n) => n.key).sort();
    expect(keys).toEqual(['l1::a', 'l2::center', 'l3::b']);
    expect(g.nodes.find((n) => n.key === 'l1::a')!.direction).toBe('incoming');
    expect(g.nodes.find((n) => n.key === 'l3::b')!.direction).toBe('outgoing');
    // Edges to invisible ring-2 nodes are dropped.
    expect(g.edges.map((e) => e.id).sort()).toEqual([
      'l1::a->l2::center',
      'l2::center->l3::b',
    ]);
  });

  test('transitive expands unlimited depth in both directions with dimming', () => {
    const g = buildFocusGraph({
      center: 'l2::center',
      moduleEdges: EDGES,
      transitive: true,
    });
    const byKey = new Map(g.nodes.map((n) => [n.key, n]));
    expect(byKey.get('l0::d')!.distance).toBe(2);
    expect(byKey.get('l0::d')!.direction).toBe('incoming');
    expect(byKey.get('l4::c')!.distance).toBe(2);
    expect(byKey.get('l4::c')!.direction).toBe('outgoing');
    expect(g.maxDistance).toBe(2);
    expect(byKey.get('l1::a')!.opacity).toBe(1);
    expect(byKey.get('l0::d')!.opacity).toBe(dimAtDistance(2));
    expect(byKey.get('l0::d')!.opacity).toBeLessThan(1);
  });

  test('incoming nodes sit above the center, outgoing below, at ring radius', () => {
    const g = buildFocusGraph({
      center: 'l2::center',
      moduleEdges: EDGES,
      transitive: false,
    });
    const a = g.nodes.find((n) => n.key === 'l1::a')!;
    const b = g.nodes.find((n) => n.key === 'l3::b')!;
    expect(a.y).toBeLessThan(0);
    expect(b.y).toBeGreaterThan(0);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(RING_GAP);
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(RING_GAP);
  });

  test('edge direction and kind survive; breach kept on the outer ring', () => {
    const g = buildFocusGraph({
      center: 'l2::center',
      moduleEdges: EDGES,
      transitive: true,
    });
    const incoming = g.edges.find((e) => e.id === 'l1::a->l2::center')!;
    const outgoing = g.edges.find((e) => e.id === 'l2::center->l3::b')!;
    const breach = g.edges.find((e) => e.id === 'l3::b->l4::c')!;
    expect(incoming.direction).toBe('incoming');
    expect(outgoing.direction).toBe('outgoing');
    expect(breach.kind).toBe('breach');
    expect(breach.opacity).toBe(dimAtDistance(2));
  });

  test('drops lateral edges between ring siblings and cross-side edges', () => {
    // a and e both feed center (ring-1 incoming); a→e is lateral noise.
    // a→b crosses from the incoming side to the outgoing side.
    const g = buildFocusGraph({
      center: 'l2::center',
      moduleEdges: [
        ...EDGES,
        edge('l1', 'e', 'l2', 'center'),
        edge('l1', 'a', 'l1', 'e'),
        edge('l1', 'a', 'l3', 'b'),
      ],
      transitive: true,
    });
    const ids = g.edges.map((e) => e.id);
    expect(ids).not.toContain('l1::a->l1::e');
    expect(ids).not.toContain('l1::a->l3::b');
    // Path-extending edge on the incoming side survives.
    expect(ids).toContain('l0::d->l1::a');
  });

  test('deterministic placement for identical input', () => {
    const run = () =>
      buildFocusGraph({
        center: 'l2::center',
        moduleEdges: EDGES,
        transitive: true,
      });
    expect(run()).toEqual(run());
  });
});
