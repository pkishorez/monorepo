import { describe, expect, it } from 'vitest';

import {
  checkoutMachineV6,
  documentReviewMachineV6,
  runtimeChoiceMachineV6,
  trafficLightMachineV6,
} from '../../fixtures/xstate-v6/machines';
import { serializeV6 } from './serialize';

describe('xstate v6 state machine serialization', () => {
  it('creates a JSON-safe model from a v6 directed graph', () => {
    const serialized = serializeV6(checkoutMachineV6);

    expect(serialized).toMatchObject({
      id: 'checkout-v6',
      label: 'Checkout V6',
    });
    expect(
      serialized.nodes.find((node) => node.id === 'checkout-v6.cart'),
    ).toMatchObject({
      path: ['cart'],
      label: 'Cart',
      initial: true,
      type: 'atomic',
    });
    expect(() => JSON.stringify(serialized)).not.toThrow();
  });

  it('keeps choice state nodes as their own type', () => {
    const serialized = serializeV6(checkoutMachineV6);

    expect(
      serialized.nodes.find((node) => node.id === 'checkout-v6.routing'),
    ).toMatchObject({ label: 'Routing', type: 'choice' });
  });

  it('draws an edge per declarative choice branch', () => {
    const serialized = serializeV6(checkoutMachineV6);
    const branches = serialized.edges.filter(
      (edge) => edge.source === 'checkout-v6.routing',
    );

    expect(branches).toEqual([
      expect.objectContaining({
        target: 'checkout-v6.expressLane',
        label: 'VIP customer',
      }),
      expect.objectContaining({
        target: 'checkout-v6.reviewLane',
        label: 'Large basket',
      }),
      expect.objectContaining({
        target: 'checkout-v6.standardLane',
        label: 'otherwise',
      }),
    ]);
  });

  it('leaves a choice function without outgoing edges', () => {
    const serialized = serializeV6(runtimeChoiceMachineV6);

    expect(
      serialized.nodes.find((node) => node.id === 'runtime-choice-v6.routing'),
    ).toMatchObject({ type: 'choice' });
    expect(
      serialized.edges.filter(
        (edge) => edge.source === 'runtime-choice-v6.routing',
      ),
    ).toHaveLength(0);
  });

  it('humanizes v6 synthetic transition events', () => {
    const charging = serializeV6(checkoutMachineV6).edges.filter(
      (edge) => edge.source === 'checkout-v6.charging',
    );

    expect(charging.map((edge) => edge.label).sort()).toEqual([
      'APPROVED',
      'After 5s',
      'Error',
      'Timeout',
    ]);
  });

  it('formats numeric delays with a unit', () => {
    const serialized = serializeV6(trafficLightMachineV6);

    expect(
      serialized.edges.find(
        (edge) => edge.source === 'traffic-light-v6.yellow',
      ),
    ).toMatchObject({ target: 'traffic-light-v6.red', label: 'After 3s' });
  });

  it('serializes parallel regions and onDone transitions', () => {
    const serialized = serializeV6(documentReviewMachineV6);

    expect(
      serialized.nodes.find((node) => node.id === 'document-review-v6.review'),
    ).toMatchObject({ type: 'parallel' });
    expect(
      serialized.edges.find(
        (edge) => edge.target === 'document-review-v6.approved',
      ),
    ).toMatchObject({ label: 'Done' });
  });
});
