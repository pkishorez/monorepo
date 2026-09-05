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

  test('gives every Layer one box of one width, never a lane-spanning rail', () => {
    const layout = layoutGraph(groupedInput);
    const layers = layout.nodes.filter(({ type }) => type === 'layer');

    expect(layers.filter(({ id }) => id === 'application')).toHaveLength(1);
    expect(new Set(layers.map(({ width }) => width))).toEqual(new Set([176]));
  });

  test('points every Rule at the one real Layer it names', () => {
    const layout = layoutGraph(groupedInput);
    const drawn = layout.nodes.map(({ id }) => id);

    for (const edge of layout.edges.filter(({ id }) =>
      id.startsWith('configured:'),
    )) {
      expect(drawn).toContain(edge.source);
      expect(drawn).toContain(edge.target);
    }
    expect(
      layout.edges
        .filter(({ id }) => id.startsWith('configured:'))
        .map(({ id }) => id),
    ).toEqual([
      'configured:web->application',
      'configured:application->domain',
      'configured:api->application',
    ]);
  });

  test('dashes a Rule that leaves its lane and draws it once', () => {
    const layout = layoutGraph(groupedInput);
    const dashed = layout.edges.filter(
      ({ id, style }) =>
        id.startsWith('configured:') && style?.strokeDasharray !== undefined,
    );

    expect(dashed.map(({ id }) => id)).toEqual(['configured:api->application']);
  });

  test('keeps a selected LayerGraph lit together with what it reaches', () => {
    const layout = layoutGraph({
      ...groupedInput,
      activeLayerGraphId: 'api-architecture',
    });
    const layers = new Map(
      layout.nodes
        .filter(({ type }) => type === 'layer')
        .map((node) => [node.id, node.data]),
    );

    expect(layers.get('api')).toMatchObject({ dimmed: false });
    expect(layers.get('application')).toMatchObject({
      dimmed: false,
      related: true,
    });
    expect(layers.get('domain')).toMatchObject({
      dimmed: false,
      related: true,
    });
    expect(layers.get('web')).toMatchObject({ dimmed: true });
    expect(
      layout.edges
        .filter(({ id }) => id.startsWith('configured:'))
        .filter(({ style }) => style?.opacity === 1)
        .map(({ id }) => id),
    ).toEqual([
      'configured:application->domain',
      'configured:api->application',
    ]);
  });

  test('isolates a LayerGraph down to itself and what it depends on', () => {
    const isolated = layoutGraph({
      ...groupedInput,
      activeLayerGraphId: 'api-architecture',
      isolatedLayerGraphId: 'api-architecture',
    });
    expect(
      isolated.nodes
        .filter(({ type }) => type === 'lane')
        .map(({ id }) => id.slice('lane:'.length)),
    ).toEqual(['web-architecture', 'api-architecture']);
    expect(
      isolated.nodes.filter(({ type }) => type === 'layer').map(({ id }) => id),
    ).toEqual(['api', 'application', 'domain']);
  });

  test('drops a LayerGraph the isolated one does not depend on', () => {
    const withReporting = {
      ...groupedInput,
      layers: [...groupedInput.layers, { id: 'reporting', scopes: [] }],
      layerGraphs: [
        ...groupedInput.layerGraphs,
        {
          id: 'reporting-architecture',
          rules: [{ fromLayerId: 'reporting', toLayerIds: ['domain'] }],
        },
      ],
    };
    const lanes = ({ nodes }: ReturnType<typeof layoutGraph>) =>
      nodes.filter(({ type }) => type === 'lane').length;

    expect(lanes(layoutGraph(withReporting))).toBe(3);
    expect(
      lanes(
        layoutGraph({
          ...withReporting,
          activeLayerGraphId: 'api-architecture',
          isolatedLayerGraphId: 'api-architecture',
        }),
      ),
    ).toBe(2);
  });

  test('dims nothing it kept, and marks the dependencies as related', () => {
    const isolated = layoutGraph({
      ...groupedInput,
      activeLayerGraphId: 'api-architecture',
      isolatedLayerGraphId: 'api-architecture',
    });
    const layers = new Map(
      isolated.nodes
        .filter(({ type }) => type === 'layer')
        .map((node) => [node.id, node.data]),
    );

    expect([...layers.values()].every(({ dimmed }) => dimmed === false)).toBe(
      true,
    );
    expect(layers.get('api')).toMatchObject({ related: false });
    expect(layers.get('application')).toMatchObject({ related: true });
    expect(layers.get('domain')).toMatchObject({ related: true });
  });

  test('lands an isolated Rule on the real Layer', () => {
    const isolated = layoutGraph({
      ...groupedInput,
      activeLayerGraphId: 'api-architecture',
      isolatedLayerGraphId: 'api-architecture',
    });

    expect(
      isolated.edges
        .filter(({ id }) => id.startsWith('configured:'))
        .map(({ source, target }) => `${source}->${target}`),
    ).toEqual(['application->domain', 'api->application']);
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
      activationEnabled: true,
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
