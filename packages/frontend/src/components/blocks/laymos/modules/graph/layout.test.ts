import { describe, expect, test } from 'vitest';

import type { Layer } from '../../layers/model';
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
    nested: [],
  },
  {
    id: 'src/domain/orders',
    layerId: 'domain',
    shared: false,
    kind: 'terminal',
    nested: [{ id: 'src/domain/orders/events', path: 'events' }],
  },
] as const;
const dependencies = [
  {
    fromModuleId: 'src/application/orders',
    toModuleId: 'src/domain/orders',
    toEntryPointId: 'src/domain/orders/events',
  },
] as const;

describe('layoutModuleGraph', () => {
  test('wraps LayerGraphs and stretches shared Layers across them', () => {
    const layout = layoutModuleGraph({
      layers,
      rules: [{ fromLayerId: 'application', toLayerIds: ['domain'] }],
      layerGraphs: [
        {
          id: 'application-architecture',
          rules: [{ fromLayerId: 'application', toLayerIds: ['domain'] }],
        },
        {
          id: 'delivery-architecture',
          rules: [{ fromLayerId: 'application', toLayerIds: ['domain'] }],
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
    expect(application?.data.sharedAcrossGraphs).toBe(true);
    expect(application?.data.targetHandles).toHaveLength(2);
    expect(application?.width).toBeGreaterThan(404);
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
    nested: [],
  };
}
