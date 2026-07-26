import { describe, expect, it } from 'vitest';

import { orderMachine } from '../fixtures/machines';
import { serializeStateMachine } from './serialize-machine';

describe('state machine serialization', () => {
  it('creates a JSON-safe model from an XState directed graph', () => {
    const serialized = serializeStateMachine(orderMachine);

    expect(serialized).toMatchObject({
      id: 'order-processing',
      label: 'Order Processing',
    });
    expect(serialized.nodes).toHaveLength(7);
    expect(serialized.edges).toHaveLength(9);
    expect(
      serialized.nodes.find((node) => node.id === 'order-processing.draft'),
    ).toMatchObject({
      label: 'Draft',
      initial: true,
      type: 'atomic',
    });
    expect(
      serialized.nodes.find((node) => node.id === 'order-processing.complete'),
    ).toMatchObject({
      label: 'Complete',
      type: 'final',
    });
    expect(
      serialized.edges.find(
        (edge) =>
          edge.source === 'order-processing.draft' &&
          edge.target === 'order-processing.validating',
      ),
    ).toMatchObject({ label: 'SUBMIT' });
    expect(() => JSON.stringify(serialized)).not.toThrow();
  });
});
