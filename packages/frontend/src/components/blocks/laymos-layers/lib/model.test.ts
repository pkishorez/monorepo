import { describe, expect, it } from 'vitest';

import { laymosLayersFixtureReport } from '../fixtures/reports';
import {
  buildLaymosLayersModel,
  edgeKey,
  getActiveModel,
  hasConfiguredEdge,
  hasObservedEdge,
} from './model';

const model = buildLaymosLayersModel(laymosLayersFixtureReport);

describe('laymos layers model', () => {
  it('keeps authored edges available while reducing the displayed skeleton', () => {
    expect(hasConfiguredEdge(model, 'routes', 'domain')).toBe(true);
    expect(
      model.displayConfiguredEdges.some(
        (edge) => edge.from === 'routes' && edge.to === 'domain',
      ),
    ).toBe(false);
  });

  it('aggregates exact observed layer pairs and omits intra-layer imports', () => {
    expect(hasObservedEdge(model, 'routes', 'domain')).toBe(true);
    expect(hasObservedEdge(model, 'domain', 'domain')).toBe(false);
    expect(
      model.observedEdgeByKey.get(edgeKey('routes', 'domain'))?.fileEdges,
    ).toHaveLength(1);
  });

  it('marks cross-graph observed connections as violations', () => {
    expect(
      model.observedEdgeByKey.get(edgeKey('routes', 'controllers')),
    ).toMatchObject({
      violating: true,
    });
  });

  it('reveals direct configured and exact observed neighbors for a layer', () => {
    const active = getActiveModel(model, { kind: 'layer', name: 'routes' });
    expect(active.outgoingLayers).toEqual(
      new Set(['ui', 'domain', 'controllers']),
    );
    expect(active.visibleObservedEdges).toEqual(
      new Set([
        edgeKey('routes', 'ui'),
        edgeKey('routes', 'domain'),
        edgeKey('routes', 'controllers'),
      ]),
    );
  });

  it('reveals internal observations and incident violations for a graph', () => {
    const active = getActiveModel(model, { kind: 'graph', name: 'api' });
    expect(active.visibleObservedEdges).toContain(
      edgeKey('controllers', 'services'),
    );
    expect(active.visibleObservedEdges).toContain(
      edgeKey('routes', 'controllers'),
    );
    expect(active.visibleObservedEdges).not.toContain(
      edgeKey('routes', 'domain'),
    );
  });
});
