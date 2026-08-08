import { describe, expect, test } from 'vitest';

import { layoutGraph } from './layout';

const groupedInput = {
  layers: ['web', 'api', 'application', 'domain'].map((id) => ({
    id,
    scopes: [],
  })),
  rules: [
    { fromLayerId: 'web', toLayerIds: ['application'] },
    { fromLayerId: 'api', toLayerIds: ['application'] },
    { fromLayerId: 'application', toLayerIds: ['domain'] },
  ],
  layerGraphs: [
    {
      id: 'web-architecture',
      rules: [
        { fromLayerId: 'web', toLayerIds: ['application'] },
        { fromLayerId: 'application', toLayerIds: ['domain'] },
      ],
    },
    {
      id: 'api-architecture',
      rules: [
        { fromLayerId: 'api', toLayerIds: ['application'] },
        { fromLayerId: 'application', toLayerIds: ['domain'] },
      ],
    },
  ],
} as const;

describe('layoutGraph', () => {
  test('wraps each LayerGraph and keeps equal-depth layers aligned', () => {
    const layout = layoutGraph(groupedInput);
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));

    expect(nodes.get('lane:web-architecture')).toBeDefined();
    expect(nodes.get('lane:api-architecture')).toBeDefined();
    expect(nodes.get('graph:web-architecture')).toBeDefined();
    expect(nodes.get('graph:api-architecture')).toBeDefined();
    expect(nodes.get('web')?.position.y).toBe(nodes.get('api')?.position.y);
    expect(nodes.get('application')?.position.y).toBeGreaterThan(
      nodes.get('web')!.position.y,
    );
    expect(nodes.get('domain')?.position.y).toBeGreaterThan(
      nodes.get('application')!.position.y,
    );
  });

  test('renders a shared layer once and stretches it across its graphs', () => {
    const layout = layoutGraph(groupedInput);
    const applicationNodes = layout.nodes.filter(
      ({ id }) => id === 'application',
    );

    expect(applicationNodes).toHaveLength(1);
    expect(applicationNodes[0]?.width).toBeGreaterThan(176);
    expect(applicationNodes[0]?.data).toMatchObject({ shared: true });
    expect(applicationNodes[0]?.data.targetHandles).toHaveLength(2);
  });

  test('uses only configured rules and passive orthogonal connectors', () => {
    const layout = layoutGraph(groupedInput);
    const ruleEdges = layout.edges.filter(
      ({ id }) => !id.startsWith('membership:'),
    );

    expect(
      ruleEdges.every(
        (edge) =>
          edge.id.startsWith('configured:') &&
          edge.type === 'smoothstep' &&
          edge.interactionWidth === 0 &&
          edge.style?.pointerEvents === 'none',
      ),
    ).toBe(true);
    expect(
      layout.edges.filter(
        ({ source, target }) => source === 'application' && target === 'domain',
      ),
    ).toHaveLength(1);
  });

  test('highlights only the selected LayerGraph lane', () => {
    const layout = layoutGraph({
      ...groupedInput,
      activeLayerGraphId: 'web-architecture',
    });
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));

    expect(nodes.get('lane:web-architecture')?.data).toMatchObject({
      dimmed: false,
    });
    expect(nodes.get('lane:api-architecture')?.data).toMatchObject({
      dimmed: true,
    });
    expect(nodes.get('web')?.data).toMatchObject({
      dimmed: false,
      activationEnabled: true,
    });
    expect(nodes.get('api')?.data).toMatchObject({
      dimmed: true,
      activationEnabled: false,
    });
    expect(nodes.get('application')?.data).toMatchObject({ dimmed: false });
  });

  test('routes a violation with the grouped graph edge style', () => {
    const layout = layoutGraph({
      ...groupedInput,
      activeViolationPair: {
        id: 'domain-to-application',
        fromLayerId: 'domain',
        toLayerId: 'application',
        violations: [],
      },
    });
    const violation = layout.edges.find((edge) =>
      edge.id.startsWith('violation:'),
    );

    expect(violation).toMatchObject({
      type: 'smoothstep',
      style: { stroke: 'var(--destructive)', strokeWidth: 2.5 },
    });
    expect(violation?.sourceHandle).toBeDefined();
    expect(violation?.targetHandle).toBeDefined();
  });

  test('preserves active and hovered layer focus', () => {
    const layout = layoutGraph({
      layers: [
        { id: 'application', scopes: [] },
        { id: 'domain', scopes: [] },
        { id: 'infrastructure', scopes: [] },
        { id: 'unrelated', scopes: [] },
      ],
      rules: [
        {
          fromLayerId: 'application',
          toLayerIds: ['domain', 'infrastructure'],
        },
      ],
      activeLayerId: 'application',
      hoveredLayerId: 'domain',
    });

    expect(
      layout.nodes.find(({ id }) => id === 'application')?.data,
    ).toMatchObject({ focused: true, related: false });
    expect(
      layout.nodes.find(({ id }) => id === 'domain')?.data.softlyDimmed,
    ).toBe(false);
    expect(
      layout.nodes.find(({ id }) => id === 'infrastructure')?.data,
    ).toMatchObject({ softlyDimmed: true });
    expect(
      layout.edges.find(({ target }) => target === 'infrastructure')?.style
        ?.opacity,
    ).toBe(0);
    expect(layout.nodes.find(({ id }) => id === 'unrelated')?.data).toEqual(
      expect.objectContaining({ dimmed: true, softlyDimmed: false }),
    );
  });
});
