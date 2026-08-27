import { describe, expect, it } from 'vitest';

import { layoutGraph } from '../graph-layout';
import { presentSnapshot } from '../relationship-presentation';
import { annotatedSnapshot } from '../relationship-presentation/test-data';
import { applyRelationshipFocus } from './relationship-focus';

describe('applyRelationshipFocus', () => {
  it('focuses only a selected field relationship and its target', async () => {
    const layout = await layoutGraph(presentSnapshot(annotatedSnapshot));
    const focused = applyRelationshipFocus(
      { kind: 'field', entityId: 'Order', fieldName: 'customerId' },
      layout.nodes,
      layout.edges,
    );

    expect(focused.nodes.find(({ id }) => id === 'Order')?.data).toMatchObject({
      focused: true,
      selectedField: 'customerId',
      connectedFields: ['customerId'],
      dimmed: false,
    });
    expect(
      focused.nodes.find(({ id }) => id === 'Customer')?.data,
    ).toMatchObject({
      related: true,
      connectedFields: ['id'],
      dimmed: false,
    });
    expect(focused.edges[0]?.style).toMatchObject({
      stroke: 'var(--primary)',
      opacity: 0.96,
    });
  });

  it('highlights every reference field connected to a selected id field', async () => {
    const layout = await layoutGraph(presentSnapshot(annotatedSnapshot));
    const focused = applyRelationshipFocus(
      { kind: 'field', entityId: 'Customer', fieldName: 'id' },
      layout.nodes,
      layout.edges,
    );

    expect(
      focused.nodes.find(({ id }) => id === 'Customer')?.data,
    ).toMatchObject({
      focused: true,
      selectedField: 'id',
      connectedFields: ['id'],
    });
    expect(focused.nodes.find(({ id }) => id === 'Order')?.data).toMatchObject({
      related: true,
      connectedFields: ['customerId'],
      dimmed: false,
    });
    expect(focused.edges[0]?.style?.opacity).toBe(0.96);
  });

  it('keeps every connector attached to a selected entity visible', async () => {
    const layout = await layoutGraph(presentSnapshot(annotatedSnapshot));
    const focused = applyRelationshipFocus(
      { kind: 'entity', entityId: 'Customer' },
      layout.nodes,
      layout.edges,
    );

    expect(focused.nodes.every(({ data }) => !data.dimmed)).toBe(true);
    expect(focused.edges[0]?.style?.opacity).toBe(0.96);
  });

  it('narrows a selected entity to a hovered connected entity', async () => {
    const layout = await layoutGraph(presentSnapshot(annotatedSnapshot));
    const unrelated = {
      ...layout.nodes[1]!,
      id: 'Unrelated',
      data: {
        ...layout.nodes[1]!.data,
        entity: { ...layout.nodes[1]!.data.entity, id: 'Unrelated' },
      },
    };
    const focused = applyRelationshipFocus(
      { kind: 'entity', entityId: 'Customer' },
      [...layout.nodes, unrelated],
      layout.edges,
      { kind: 'entity', entityId: 'Order' },
    );

    expect(
      focused.nodes.find(({ id }) => id === 'Customer')?.data.focused,
    ).toBe(true);
    expect(focused.nodes.find(({ id }) => id === 'Order')?.data.related).toBe(
      true,
    );
    expect(
      focused.nodes.find(({ id }) => id === 'Unrelated')?.data.dimmed,
    ).toBe(true);
    expect(focused.edges[0]?.style?.opacity).toBe(0.96);
  });

  it('keeps card-level narrowing over an ordinary field', async () => {
    const layout = await layoutGraph(presentSnapshot(annotatedSnapshot));
    const otherNode = {
      ...layout.nodes[1]!,
      id: 'Other',
      data: {
        ...layout.nodes[1]!.data,
        entity: { ...layout.nodes[1]!.data.entity, id: 'Other' },
      },
    };
    const otherEdge = {
      ...layout.edges[0]!,
      id: 'Other:customerId->Customer',
      source: 'Other',
      data: {
        relationship: {
          ...layout.edges[0]!.data!.relationship,
          id: 'Other:customerId->Customer',
          source: 'Other',
        },
      },
    };
    const focused = applyRelationshipFocus(
      { kind: 'entity', entityId: 'Customer' },
      [...layout.nodes, otherNode],
      [...layout.edges, otherEdge],
      { kind: 'field', entityId: 'Order', fieldName: 'status' },
    );

    expect(focused.nodes.find(({ id }) => id === 'Order')?.data.related).toBe(
      true,
    );
    expect(focused.nodes.find(({ id }) => id === 'Other')?.data.dimmed).toBe(
      true,
    );
    expect(
      focused.edges.find(({ id }) => id === otherEdge.id)?.style?.opacity,
    ).toBe(0.1);
    expect(focused.edges[0]?.style?.opacity).toBe(0.96);
  });

  it('narrows a selected entity to the exact hovered field edge', async () => {
    const layout = await layoutGraph(presentSnapshot(annotatedSnapshot));
    const focused = applyRelationshipFocus(
      { kind: 'entity', entityId: 'Customer' },
      layout.nodes,
      layout.edges,
      { kind: 'field', entityId: 'Order', fieldName: 'customerId' },
    );

    expect(
      focused.nodes.find(({ id }) => id === 'Customer')?.data,
    ).toMatchObject({ focused: true, connectedFields: ['id'] });
    expect(focused.nodes.find(({ id }) => id === 'Order')?.data).toMatchObject({
      related: true,
      connectedFields: ['customerId'],
    });
    expect(focused.edges[0]?.style?.opacity).toBe(0.96);
  });
});
