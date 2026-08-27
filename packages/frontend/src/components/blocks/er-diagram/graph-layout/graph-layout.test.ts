import { describe, expect, it } from 'vitest';

import { presentSnapshot } from '../relationship-presentation';
import {
  annotatedSnapshot,
  nestedSnapshot,
  selfReferenceSnapshot,
} from '../relationship-presentation/test-data';
import { layoutGraph } from './graph-layout';

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
});
