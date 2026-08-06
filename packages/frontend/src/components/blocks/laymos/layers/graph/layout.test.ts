import { describe, expect, test } from 'vitest';

import { layoutGraph } from './layout';

describe('layoutGraph', () => {
  test('gives each rule dedicated source and target ports', () => {
    const layout = layoutGraph({
      layers: [
        { id: 'application', scopes: [] },
        { id: 'domain', scopes: [] },
        { id: 'infrastructure', scopes: [] },
      ],
      rules: [
        {
          fromLayerId: 'application',
          toLayerIds: ['domain', 'infrastructure'],
        },
      ],
    });

    const application = layout.nodes.find((node) => node.id === 'application');
    expect(application?.data.outgoingPortIds).toHaveLength(2);
    expect(new Set(layout.edges.map((edge) => edge.sourceHandle)).size).toBe(2);
    expect(layout.edges.every((edge) => edge.targetHandle !== undefined)).toBe(
      true,
    );
  });

  test('routes a violation directly between its two layers', () => {
    const layout = layoutGraph({
      layers: [
        { id: 'domain', scopes: [] },
        { id: 'infrastructure', scopes: [] },
      ],
      rules: [{ fromLayerId: 'infrastructure', toLayerIds: ['domain'] }],
      activeViolationPair: {
        id: 'domain-to-infrastructure',
        fromLayerId: 'domain',
        toLayerId: 'infrastructure',
        violations: [],
      },
    });

    const violation = layout.edges.find((edge) =>
      edge.id.startsWith('violation:'),
    );
    expect(violation?.type).toBe('routed');
    expect(violation?.data?.points).toHaveLength(2);
  });

  test('does not give the active layer a related-layer fill', () => {
    const layout = layoutGraph({
      layers: [
        { id: 'application', scopes: [] },
        { id: 'domain', scopes: [] },
      ],
      rules: [{ fromLayerId: 'application', toLayerIds: ['domain'] }],
      activeLayerId: 'application',
      hoveredLayerId: 'domain',
    });

    const application = layout.nodes.find((node) => node.id === 'application');
    expect(application?.data.focused).toBe(true);
    expect(application?.data.related).toBe(false);
  });
});
