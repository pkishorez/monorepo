import { describe, expect, test } from 'vitest';

import type { Layer } from '../../layers/model';
import type { Module } from '../model';
import {
  moduleDependencies as fixtureDependencies,
  moduleGraphs,
  moduleLayerGraphs,
  moduleLayers,
  moduleRules,
  modules as fixtureModules,
  moduleViolations,
} from '../fixtures/fixture-data';
import { layoutModuleGraph } from './layout';

const layers: readonly Layer[] = [
  { id: 'application', scopes: [] },
  { id: 'domain', scopes: [] },
];
const modules = [
  {
    id: 'src/application/orders',
    layerId: 'application',
    shared: false,
    kind: 'root',
    exposed: true,
  },
  {
    id: 'src/domain/orders',
    layerId: 'domain',
    shared: false,
    kind: 'terminal',
    exposed: true,
  },
] as const;
const dependencies = [
  {
    fromModuleId: 'src/application/orders',
    toModuleId: 'src/domain/orders',
    toEntryPointId: 'src/domain/orders/events',
    permitted: true,
  },
] as const;

describe('layoutModuleGraph', () => {
  test('isolates a LayerGraph without drawing a Layer it dropped', () => {
    const layout = layoutModuleGraph({
      layers: [...layers, { id: 'reporting', scopes: [] }],
      rules: [
        { fromLayerId: 'application', toLayerIds: ['domain'] },
        { fromLayerId: 'reporting', toLayerIds: ['domain'] },
      ],
      layerGraphs: [
        {
          id: 'application-architecture',
          rules: [{ fromLayerId: 'application', toLayerIds: ['domain'] }],
        },
        {
          id: 'reporting-architecture',
          rules: [{ fromLayerId: 'reporting', toLayerIds: ['domain'] }],
        },
      ],
      modules: [
        ...modules,
        {
          id: 'src/reporting/exports',
          layerId: 'reporting',
          shared: false,
          kind: 'root',
          exposed: true,
        },
      ],
      dependencies,
      showLayerConnections: true,
      activeLayerGraphId: 'application-architecture',
      isolatedLayerGraphId: 'application-architecture',
    });
    const ids = new Set(layout.nodes.map(({ id }) => id));

    expect(ids.has('application')).toBe(true);
    expect(ids.has('domain')).toBe(true);
    expect(ids.has('reporting')).toBe(false);
    expect(ids.has('src/reporting/exports')).toBe(false);
    for (const { source, target } of layout.edges) {
      expect(ids.has(source) || source.startsWith('module-graph-header:')).toBe(
        true,
      );
      expect(target.startsWith('src/reporting')).toBe(false);
    }
  });

  test('wraps LayerGraphs and gives every Layer one lane', () => {
    const layout = layoutModuleGraph({
      layers: [...layers, { id: 'delivery', scopes: [] }],
      rules: [{ fromLayerId: 'application', toLayerIds: ['domain'] }],
      layerGraphs: [
        {
          id: 'application-architecture',
          rules: [{ fromLayerId: 'application', toLayerIds: ['domain'] }],
        },
        {
          id: 'delivery-architecture',
          rules: [{ fromLayerId: 'delivery', toLayerIds: ['application'] }],
        },
      ],
      modules,
      dependencies,
      showLayerConnections: true,
    });
    const application = layout.nodes.find(({ id }) => id === 'application');

    expect(
      layout.nodes.filter(({ type }) => type === 'module-graph-lane'),
    ).toHaveLength(2);
    expect(application?.width).toBeLessThanOrEqual(404);
    expect(
      layout.edges.find(({ id }) => id.startsWith('module-layer:'))?.style,
    ).toEqual(
      expect.objectContaining({
        stroke:
          'color-mix(in oklab, var(--muted-foreground) 55%, var(--background))',
      }),
    );
    expect(
      layout.edges.find(({ id }) => id.startsWith('module-layer:'))?.style
        ?.opacity,
    ).toBeUndefined();
  });

  test('toggles configured Layer connections without hiding Layers', () => {
    const layout = layoutModuleGraph({
      layers,
      rules: [{ fromLayerId: 'application', toLayerIds: ['domain'] }],
      modules,
      dependencies,
      focusedLayerId: 'application',
      showLayerConnections: false,
    });

    expect(layout.nodes.some(({ id }) => id === 'domain')).toBe(true);
    expect(layout.edges.some(({ id }) => id.startsWith('module-layer:'))).toBe(
      false,
    );
    expect(
      layout.edges.some(({ id }) => id.startsWith('module-graph-membership:')),
    ).toBe(true);
  });

  test('lays out a filtered subset of a configured LayerGraph', () => {
    const layout = layoutModuleGraph({
      layers: [layers[0]!],
      rules: [{ fromLayerId: 'application', toLayerIds: ['domain'] }],
      layerGraphs: [
        {
          id: 'application-architecture',
          rules: [{ fromLayerId: 'application', toLayerIds: ['domain'] }],
        },
      ],
      modules: [modules[0]],
      dependencies,
      showLayerConnections: true,
    });

    expect(layout.nodes.some(({ id }) => id === 'application')).toBe(true);
    expect(layout.nodes.some(({ id }) => id === 'domain')).toBe(false);
    expect(
      layout.edges.some(({ source, target }) =>
        [source, target].includes('domain'),
      ),
    ).toBe(false);
  });

  test('keeps Layer positions stable when connections are revealed', () => {
    const baseline = layoutModuleGraph({
      layers,
      rules: [{ fromLayerId: 'application', toLayerIds: ['domain'] }],
      modules,
      dependencies,
      focusedLayerId: 'application',
      showLayerConnections: true,
    });
    const focused = layoutModuleGraph({
      layers,
      rules: [{ fromLayerId: 'application', toLayerIds: ['domain'] }],
      modules,
      dependencies,
      focusedLayerId: 'application',
      showLayerConnections: true,
      activeModuleId: 'src/application/orders',
    });

    expect(
      focused.nodes.find(({ id }) => id === 'application')?.position,
    ).toEqual(baseline.nodes.find(({ id }) => id === 'application')?.position);
  });

  test('shows only direct Layer connections while a Layer is focused', () => {
    const layout = layoutModuleGraph({
      layers: [
        ...layers,
        { id: 'worker', scopes: [] },
        { id: 'infrastructure', scopes: [] },
      ],
      rules: [
        { fromLayerId: 'application', toLayerIds: ['domain'] },
        { fromLayerId: 'worker', toLayerIds: ['infrastructure'] },
      ],
      modules,
      dependencies,
      focusedLayerId: 'application',
      showLayerConnections: true,
    });

    expect(layout.nodes.find(({ id }) => id === 'domain')?.data.dimmed).toBe(
      false,
    );
    expect(layout.nodes.find(({ id }) => id === 'worker')?.data.dimmed).toBe(
      true,
    );
    expect(
      layout.edges.find(
        ({ source, target }) => source === 'application' && target === 'domain',
      )?.style?.opacity,
    ).toBeUndefined();
    expect(
      layout.edges.find(
        ({ source, target }) =>
          source === 'worker' && target === 'infrastructure',
      )?.style?.opacity,
    ).toBe(0);
    expect(
      layout.edges.find(({ id }) => id.startsWith('module-graph-membership:'))
        ?.style?.opacity,
    ).toBe(0);
  });

  test('routes a dependency to its exact Subpath', () => {
    const layout = layoutModuleGraph({
      layers,
      rules: [{ fromLayerId: 'application', toLayerIds: ['domain'] }],
      modules,
      dependencies,
      focusedLayerId: 'application',
      showLayerConnections: false,
      activeModuleId: 'src/application/orders',
    });

    expect(layout.edges).toContainEqual(
      expect.objectContaining({
        source: 'src/application/orders',
        target: 'src/domain/orders/events',
      }),
    );
  });

  test('softly dims other direct connections while a related Module is hovered', () => {
    const extraModule = module('src/domain/customers', 'domain');
    const unrelatedModule = module('src/worker/jobs', 'worker');
    const layout = layoutModuleGraph({
      layers: [...layers, { id: 'worker', scopes: [] }],
      rules: [{ fromLayerId: 'application', toLayerIds: ['domain'] }],
      modules: [...modules, extraModule, unrelatedModule],
      dependencies: [
        ...dependencies,
        {
          fromModuleId: 'src/application/orders',
          toModuleId: extraModule.id,
          toEntryPointId: extraModule.id,
          permitted: true,
        },
      ],
      showLayerConnections: true,
      activeModuleId: 'src/application/orders',
      hoveredModuleId: 'src/domain/orders/events',
    });

    expect(
      layout.nodes.find(({ id }) => id === extraModule.id)?.data.softlyDimmed,
    ).toBe(true);
    expect(
      layout.edges.find(({ target }) => target === extraModule.id)?.className,
    ).toBe('opacity-0');
    expect(
      layout.edges.find(({ target }) => target === 'src/domain/orders/events')
        ?.className,
    ).toBeUndefined();
    expect(
      layout.edges.find(({ id }) => id.startsWith('module-layer:'))?.style
        ?.opacity,
    ).toBe(0);
    expect(layout.nodes.find(({ id }) => id === 'worker')?.data).toEqual(
      expect.objectContaining({ dimmed: true, softlyDimmed: false }),
    );
  });

  test('gives Layers at the same depth equal height and vertical position', () => {
    const sameDepthLayers: readonly Layer[] = [
      { id: 'web', scopes: [] },
      { id: 'workers', scopes: [] },
      { id: 'domain', scopes: [] },
    ];
    const sameDepthModules = [
      module('src/web/routes', 'web'),
      module('src/workers/email', 'workers'),
      module('src/workers/billing', 'workers'),
      module('src/workers/search', 'workers'),
      module('src/workers/audit', 'workers'),
      module('src/domain/orders', 'domain'),
    ] as const;
    const layout = layoutModuleGraph({
      layers: sameDepthLayers,
      rules: [
        { fromLayerId: 'web', toLayerIds: ['domain'] },
        { fromLayerId: 'workers', toLayerIds: ['domain'] },
      ],
      modules: sameDepthModules,
      dependencies: [],
      showLayerConnections: true,
    });
    const web = layout.nodes.find(({ id }) => id === 'web')!;
    const workers = layout.nodes.find(({ id }) => id === 'workers')!;

    expect(web.position.y).toBe(workers.position.y);
    expect(web.height).toBe(workers.height);
  });
});

function module(id: string, layerId: string) {
  return {
    id,
    layerId,
    shared: false,
    kind: 'regular' as const,
    exposed: true,
  };
}

describe('module graph bands', () => {
  const bandLayout = layoutModuleGraph({
    layers: moduleLayers,
    rules: moduleRules,
    layerGraphs: moduleLayerGraphs,
    modules: fixtureModules,
    moduleGraphs,
    dependencies: fixtureDependencies,
    showLayerConnections: true,
  });

  test('draws one band per Module Graph, parented to its Layer', () => {
    const bands = bandLayout.nodes.filter(({ type }) => type === 'module-band');

    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({
      id: 'module-band:orders',
      parentId: 'domain',
      data: { label: 'orders', memberCount: 4 },
    });
  });

  test('encloses every member inside its band', () => {
    const band = bandLayout.nodes.find(
      ({ id }) => id === 'module-band:orders',
    )!;
    const members = bandLayout.nodes.filter(({ id }) =>
      moduleGraphs[0]!.memberIds.includes(id),
    );

    expect(members).toHaveLength(4);
    for (const member of members) {
      expect(member.parentId).toBe('domain');
      expect(member.position.x).toBeGreaterThanOrEqual(band.position.x);
      expect(member.position.y).toBeGreaterThanOrEqual(band.position.y);
      expect(member.position.x + member.width!).toBeLessThanOrEqual(
        band.position.x + band.width!,
      );
      expect(member.position.y + member.height!).toBeLessThanOrEqual(
        band.position.y + band.height!,
      );
    }
  });

  test('keeps free-form Modules outside every band', () => {
    const band = bandLayout.nodes.find(
      ({ id }) => id === 'module-band:orders',
    )!;
    const freeform = bandLayout.nodes.find(
      ({ id }) => id === 'src/domain/users',
    )!;

    expect(freeform.position.y + freeform.height!).toBeLessThanOrEqual(
      band.position.y,
    );
  });

  test('stacks members by Rule depth, dependencies below dependents', () => {
    const y = (id: string) =>
      bandLayout.nodes.find((node) => node.id === id)!.position.y;

    // index.ts -> pricing -> events, so each sits strictly below the last.
    expect(y('src/domain/orders/index.ts')).toBeLessThan(
      y('src/domain/orders/pricing'),
    );
    expect(y('src/domain/orders/pricing')).toBeLessThan(
      y('src/domain/orders/events'),
    );
    // Nothing points at tax-table, so it shares the top rank with the facade.
    expect(y('src/domain/orders/tax-table')).toBe(
      y('src/domain/orders/index.ts'),
    );
  });

  test('centres each rank row within the band', () => {
    const band = bandLayout.nodes.find(
      ({ id }) => id === 'module-band:orders',
    )!;
    const centre = band.position.x + band.width! / 2;
    const lone = bandLayout.nodes.find(
      ({ id }) => id === 'src/domain/orders/pricing',
    )!;

    expect(lone.position.x + lone.width! / 2).toBeCloseTo(centre, 5);
  });

  test('draws each declared Rule as an edge', () => {
    const ruleEdges = bandLayout.edges.filter(({ id }) =>
      id.startsWith('module-rule:'),
    );

    expect(ruleEdges.map(({ source, target }) => [source, target])).toEqual([
      ['src/domain/orders/index.ts', 'src/domain/orders/pricing'],
      ['src/domain/orders/pricing', 'src/domain/orders/events'],
    ]);
  });
});

function build(overrides: Record<string, unknown> = {}) {
  return layoutModuleGraph({
    layers: moduleLayers,
    rules: moduleRules,
    layerGraphs: moduleLayerGraphs,
    modules: fixtureModules,
    moduleGraphs,
    dependencies: fixtureDependencies,
    showLayerConnections: true,
    ...overrides,
  });
}

const zOf = (
  nodes: readonly { type?: string; zIndex?: number }[],
  type: string,
) => nodes.find((node) => node.type === type)?.zIndex;

describe('paint order', () => {
  test('draws Module boxes above every ordinary edge', () => {
    const layout = build({ activeModuleId: 'src/application/orders' });
    const moduleZ = zOf(layout.nodes, 'module')!;
    const ordinary = layout.edges.filter(
      ({ id }) => !id.startsWith('violation:'),
    );

    expect(ordinary.length).toBeGreaterThan(0);
    for (const edge of ordinary) {
      expect(edge.zIndex).toBeLessThan(moduleZ);
    }
  });

  test('keeps the containers behind their contents', () => {
    const layout = build();
    const lane = zOf(layout.nodes, 'module-graph-lane')!;
    const layer = zOf(layout.nodes, 'module-layer')!;
    const band = zOf(layout.nodes, 'module-band')!;
    const module = zOf(layout.nodes, 'module')!;

    expect(lane).toBeLessThan(layer);
    expect(layer).toBeLessThan(band);
    expect(band).toBeLessThan(module);
  });

  test('lifts violation edges above Module boxes', () => {
    const layout = build({
      activeViolation: moduleViolations.find(
        ({ kind }) => kind === 'dependency',
      ),
    });
    const moduleZ = zOf(layout.nodes, 'module')!;
    const violation = layout.edges.filter(({ id }) =>
      id.startsWith('violation:'),
    );

    expect(violation.length).toBeGreaterThan(0);
    for (const edge of violation) {
      expect(edge.zIndex).toBeGreaterThan(moduleZ);
    }
  });

  test('routes every Module edge orthogonally', () => {
    const layout = build({ activeModuleId: 'src/application/orders' });
    const routed = layout.edges.filter(
      ({ id }) =>
        id.startsWith('module-rule:') || !id.startsWith('module-graph-'),
    );

    for (const edge of routed) expect(edge.type).toBe('smoothstep');
  });
});

describe('Layer packing', () => {
  const layer: readonly Layer[] = [{ id: 'domain', scopes: [] }];
  const peer = (id: string, shared = false): Module => ({
    id,
    layerId: 'domain',
    shared,
    exposed: false,
    kind: 'regular',
  });
  const pack = (
    modules: readonly Module[],
    dependencies: readonly {
      fromModuleId: string;
      toModuleId: string;
      toEntryPointId: string;
      permitted: boolean;
    }[] = [],
    moduleGraphs: Parameters<typeof layoutModuleGraph>[0]['moduleGraphs'] = [],
  ) =>
    layoutModuleGraph({
      layers: layer,
      rules: [],
      modules,
      moduleGraphs,
      dependencies,
      showLayerConnections: false,
    });
  const boxes = (layout: ReturnType<typeof layoutModuleGraph>) =>
    layout.nodes.filter(({ type }) => type === 'module');

  test('puts a Module above the Shared Module it depends on', () => {
    const layout = pack(
      [peer('a'), peer('b'), peer('shared', true)],
      [
        {
          fromModuleId: 'a',
          toModuleId: 'shared',
          toEntryPointId: 'shared',
          permitted: true,
        },
      ],
    );
    const at = new Map(boxes(layout).map((node) => [node.id, node.position.y]));

    expect(at.get('a')).toBeLessThan(at.get('shared')!);
    expect(at.get('b')).toBeLessThan(at.get('shared')!);
  });

  test('ranks nothing on an import the Config does not permit', () => {
    const peers = [peer('a'), peer('b'), peer('c'), peer('d')];
    const rows = (dependencies: Parameters<typeof pack>[1]) =>
      boxes(pack(peers, dependencies)).map(({ id, position }) => [
        id,
        position.y,
      ]);
    const violating = rows([
      {
        fromModuleId: 'a',
        toModuleId: 'd',
        toEntryPointId: 'd',
        permitted: false,
      },
    ]);

    expect(violating).toEqual(rows([]));
    expect(
      rows([
        {
          fromModuleId: 'a',
          toModuleId: 'd',
          toEntryPointId: 'd',
          permitted: true,
        },
      ]),
    ).not.toEqual(violating);
  });

  test('wraps a rank towards a square rather than one wide row', () => {
    const layout = pack(
      Array.from({ length: 9 }, (_, index) => peer(`m${index}`)),
    );
    const container = layout.nodes.find(({ type }) => type === 'module-layer')!;
    const rows = new Set(boxes(layout).map(({ position }) => position.y));

    expect(rows.size).toBeGreaterThan(1);
    expect(container.width!).toBeLessThan(container.height! * 1.5);
  });

  test('draws the imports that put a Module below its peer', () => {
    const layout = pack(
      [peer('a'), peer('shared', true)],
      [
        {
          fromModuleId: 'a',
          toModuleId: 'shared',
          toEntryPointId: 'shared',
          permitted: true,
        },
        {
          fromModuleId: 'a',
          toModuleId: 'b',
          toEntryPointId: 'b',
          permitted: false,
        },
      ],
    );
    const drawn = layout.edges.filter(({ id }) =>
      id.startsWith('module-rank:'),
    );

    expect(drawn.map(({ source, target }) => [source, target])).toEqual([
      ['a', 'shared'],
    ]);
  });

  test('hides Module connections until something is selected', () => {
    const peers = [peer('a'), peer('shared', true)];
    const dependencies = [
      {
        fromModuleId: 'a',
        toModuleId: 'shared',
        toEntryPointId: 'shared',
        permitted: true,
      },
    ];
    const rank = (layout: ReturnType<typeof layoutModuleGraph>) =>
      layout.edges.filter(({ id }) => id.startsWith('module-rank:'));

    expect(rank(pack(peers, dependencies))).toHaveLength(1);
    expect(
      rank(
        layoutModuleGraph({
          layers: layer,
          rules: [],
          modules: peers,
          dependencies,
          showLayerConnections: false,
          showModuleConnections: false,
        }),
      ),
    ).toHaveLength(0);
    expect(
      rank(
        layoutModuleGraph({
          layers: layer,
          rules: [],
          modules: peers,
          dependencies,
          showLayerConnections: false,
          showModuleConnections: false,
          activeModuleId: 'a',
        }),
      ),
    ).toHaveLength(1);
  });

  test('gives a Module Graph its own line at its rank', () => {
    const layout = pack(
      [
        peer('a'),
        peer('b'),
        { ...peer('graph/one'), exposed: true, graphId: 'capability' },
        { ...peer('graph/two'), graphId: 'capability' },
      ],
      [],
      [
        {
          id: 'capability',
          layerId: 'domain',
          path: 'graph',
          memberIds: ['graph/one', 'graph/two'],
          rules: [{ fromModuleId: 'graph/one', toModuleId: 'graph/two' }],
        },
      ],
    );
    const band = layout.nodes.find(({ type }) => type === 'module-band')!;
    const peers = boxes(layout).filter(({ id }) => !id.startsWith('graph/'));

    for (const node of peers) {
      expect(node.position.y).not.toBe(band.position.y);
    }
  });
});
