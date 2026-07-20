import { describe, expect, it } from 'vitest';

import {
  complexModulesFixtureReport,
  laymosModulesFixtureReport,
} from '../fixtures/reports';
import { getActiveModulesModel } from './connectivity';
import { computeLaymosModulesFlowLayout } from './layout';
import { buildLaymosModulesModel } from './model';

const model = buildLaymosModulesModel(laymosModulesFixtureReport);

describe('laymos modules layout', () => {
  it('places dependency layers and modules in topological order', () => {
    const layout = computeLaymosModulesFlowLayout(
      model,
      getActiveModulesModel(model, null, null),
    );
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    expect(nodes.get('layer:application')!.position.y).toBeLessThan(
      nodes.get('layer:domain')!.position.y,
    );
    expect(nodes.get('layer:domain')!.position.y).toBeLessThan(
      nodes.get('layer:platform')!.position.y,
    );
    expect(nodes.get('module:src/domain/order')!.position.y).toBeLessThan(
      nodes.get('module:src/domain/user')!.position.y,
    );
  });

  it('shows no observed module edges in the overview', () => {
    const layout = computeLaymosModulesFlowLayout(
      model,
      getActiveModulesModel(model, null, null),
    );
    expect(layout.edges.every((edge) => edge.id.startsWith('layer:'))).toBe(
      true,
    );
  });

  it('keeps geometry stable while interaction changes emphasis', () => {
    const overview = computeLaymosModulesFlowLayout(
      model,
      getActiveModulesModel(model, null, null),
    );
    const active = computeLaymosModulesFlowLayout(
      model,
      getActiveModulesModel(
        model,
        { path: 'src/application/home', depth: 'transitive' },
        'src/platform/log',
      ),
    );
    expect(
      active.nodes.map(({ id, position, width, height }) => ({
        id,
        position,
        width,
        height,
      })),
    ).toEqual(
      overview.nodes.map(({ id, position, width, height }) => ({
        id,
        position,
        width,
        height,
      })),
    );
    expect(active.edges.some((edge) => edge.id.startsWith('observed:'))).toBe(
      true,
    );
  });

  it('separates reciprocal imports and labels inspected paths', () => {
    const layout = computeLaymosModulesFlowLayout(
      model,
      getActiveModulesModel(
        model,
        { path: 'src/application/home', depth: 'transitive' },
        'src/domain/user',
      ),
    );
    const outgoing = layout.edges.find(
      (edge) => edge.id === 'observed:src/application/home->src/domain/user',
    )!;
    const incoming = layout.edges.find(
      (edge) => edge.id === 'observed:src/domain/user->src/application/home',
    )!;
    expect(outgoing.type).toBe('bezier');
    expect(incoming.type).toBe('bezier');
    expect(outgoing.sourceHandle).not.toBe(incoming.sourceHandle);
    expect(outgoing.label).toBe('imports');
    expect(incoming.label).toBe('imports');
  });

  it('keeps module edges passive and uniformly weighted', () => {
    const layout = computeLaymosModulesFlowLayout(
      model,
      getActiveModulesModel(
        model,
        { path: 'src/application/home', depth: 'direct' },
        null,
      ),
    );
    const observed = layout.edges.filter((edge) =>
      edge.id.startsWith('observed:'),
    );
    expect(observed.length).toBeGreaterThan(0);
    expect(
      observed.every(
        (edge) =>
          edge.interactionWidth === 0 && edge.style?.pointerEvents === 'none',
      ),
    ).toBe(true);
  });

  it('wraps wide sibling layers and renders a shared layer once', () => {
    const complexModel = buildLaymosModulesModel(complexModulesFixtureReport);
    const layout = computeLaymosModulesFlowLayout(
      complexModel,
      getActiveModulesModel(complexModel, null, null),
    );
    const roots = ['routes', 'controllers', 'jobs'].map(
      (layer) => layout.nodes.find((node) => node.id === `layer:${layer}`)!,
    );
    expect(new Set(roots.map((node) => node.position.y)).size).toBeGreaterThan(
      1,
    );
    expect(
      layout.nodes.filter((node) => node.id === 'layer:domain'),
    ).toHaveLength(1);
    expect(
      layout.nodes.filter((node) => node.id.startsWith('module:')),
    ).toHaveLength(60);
  });
});
