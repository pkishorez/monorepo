import { describe, expect, it } from 'vitest';

import {
  allDataTypesSnapshot,
  complexCommerceSnapshot,
} from '../fixtures/snapshots';
import { presentSnapshot } from '../relationship-presentation';
import {
  annotatedSnapshot,
  nestedSnapshot,
  selfReferenceSnapshot,
} from '../relationship-presentation/test-data';
import { layoutGraph } from './graph-layout';
import { toElkGraph } from './elk-model';

function crowdedPairs(
  nodes: Awaited<ReturnType<typeof layoutGraph>>['nodes'],
  clearance: number,
): readonly string[] {
  return nodes.flatMap((left, index) =>
    nodes.slice(index + 1).flatMap((right) => {
      const separated =
        left.position.x + (left.width ?? 0) + clearance <= right.position.x ||
        right.position.x + (right.width ?? 0) + clearance <= left.position.x ||
        left.position.y + (left.height ?? 0) + clearance <= right.position.y ||
        right.position.y + (right.height ?? 0) + clearance <= left.position.y;
      return separated ? [] : [`${left.id}:${right.id}`];
    }),
  );
}

describe('layoutGraph', () => {
  it('positions entities and binds edges to field handles', async () => {
    const layout = await layoutGraph(presentSnapshot(annotatedSnapshot));

    expect(layout.nodes).toHaveLength(2);
    expect(
      layout.nodes.every(({ position }) => Number.isFinite(position.x)),
    ).toBe(true);
    expect(layout.edges[0]).toMatchObject({
      sourceHandle: 'ref:customerId',
      targetHandle: 'id:id',
      type: 'smoothstep',
    });
  });

  it('keeps a nested external target without inventing a parent edge', async () => {
    const layout = await layoutGraph(presentSnapshot(nestedSnapshot));

    expect(layout.nodes.map(({ id }) => id)).toContain('external:Identity');
    expect(layout.edges).toEqual([]);
  });

  it('routes self references to a compact target on the same side', async () => {
    const layout = await layoutGraph(presentSnapshot(selfReferenceSnapshot));

    expect(layout.edges[0]).toMatchObject({
      sourceHandle: 'ref:parentId',
      targetHandle: 'self:id:id',
      pathOptions: { offset: 14 },
    });
  });

  it('gives ELK the real field ports used by rendered edges', () => {
    const graph = toElkGraph(presentSnapshot(annotatedSnapshot));
    const order = graph.children?.find(({ id }) => id === 'Order');

    expect(graph.edges?.[0]).toMatchObject({
      sources: ['Order:source:customerId'],
      targets: ['Customer:target:id'],
    });
    expect(order).toMatchObject({
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: [
        expect.objectContaining({
          id: 'Order:source:customerId',
          layoutOptions: expect.objectContaining({ 'elk.port.side': 'EAST' }),
        }),
      ],
    });
  });

  it('keeps dense and disconnected cards comfortably separated', async () => {
    const layouts = await Promise.all(
      [complexCommerceSnapshot, allDataTypesSnapshot].map((snapshot) =>
        layoutGraph(presentSnapshot(snapshot)),
      ),
    );

    for (const layout of layouts) {
      expect(crowdedPairs(layout.nodes, 28)).toEqual([]);
    }
  });
});
