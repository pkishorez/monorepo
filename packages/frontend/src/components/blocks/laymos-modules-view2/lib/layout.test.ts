import { describe, expect, it } from 'vitest';

import { getActiveModulesModel } from '../../laymos-modules/lib/connectivity';
import { buildLaymosModulesModel } from '../../laymos-modules/lib/model';
import {
  complexModulesFixtureReport,
  laymosModulesFixtureReport,
} from '../../laymos-modules/fixtures/reports';
import { computeFocusFlowLayout, computeTreeFlowLayout } from './layout';

describe('computeTreeFlowLayout', () => {
  it('places dependent layers left to right and keeps observed edges visible', () => {
    const model = buildLaymosModulesModel(laymosModulesFixtureReport);
    const active = getActiveModulesModel(model, null, null);
    const layout = computeTreeFlowLayout(model, active);
    const layers = layout.nodes.filter((node) => node.type === 'tree-layer');
    const byName = new Map(
      layers.map((node) => [node.data.name as string, node.position.x]),
    );

    for (const graph of laymosModulesFixtureReport.architecture.graphs) {
      for (const edge of graph.edges) {
        expect(byName.get(edge.from)).toBeLessThan(byName.get(edge.to)!);
      }
    }
    expect(layout.edges).toHaveLength(model.observedEdges.length);
    expect(layout.edges.every((edge) => edge.style?.opacity === 0.32)).toBe(
      true,
    );
  });

  it('renders the complex fixture as one module endpoint per declaration', () => {
    const model = buildLaymosModulesModel(complexModulesFixtureReport);
    const layout = computeTreeFlowLayout(
      model,
      getActiveModulesModel(model, null, null),
    );

    expect(
      layout.nodes.filter((node) => node.type === 'tree-module'),
    ).toHaveLength(60);
  });

  it('keeps only the selected neighborhood prominent', () => {
    const model = buildLaymosModulesModel(laymosModulesFixtureReport);
    const active = getActiveModulesModel(
      model,
      { path: 'src/application/home', depth: 'direct' },
      null,
    );
    const layout = computeTreeFlowLayout(model, active);

    expect(layout.edges.some((edge) => Number(edge.style?.opacity) === 1)).toBe(
      true,
    );
    expect(
      layout.edges.some((edge) => Number(edge.style?.opacity) === 0.055),
    ).toBe(true);
  });
});

describe('computeFocusFlowLayout', () => {
  it('adds transitive rings while retaining real observed edges', () => {
    const model = buildLaymosModulesModel(laymosModulesFixtureReport);
    const direct = computeFocusFlowLayout(model, 'src/application/home', false);
    const transitive = computeFocusFlowLayout(
      model,
      'src/application/home',
      true,
    );

    expect(transitive.nodes.length).toBeGreaterThanOrEqual(direct.nodes.length);
    expect(transitive.edges.length).toBeGreaterThanOrEqual(direct.edges.length);
  });
});
