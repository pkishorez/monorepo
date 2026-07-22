import { describe, expect, it } from 'vitest';

import { getActiveModulesModel } from './connectivity';
import {
  complexModulesFixtureReport,
  denseModulesFixtureReport,
  laymosModulesFixtureReport,
} from '../fixtures/reports';
import { buildLaymosModulesModel } from './model';
import { computeModuleGraphLayout } from './layout';

describe('computeModuleGraphLayout', () => {
  it('renders modules directly without layer containers', () => {
    const model = buildLaymosModulesModel(laymosModulesFixtureReport);
    const layout = computeModuleGraphLayout(
      model,
      getActiveModulesModel(model, null, null),
    );

    expect(layout.nodes).toHaveLength(model.modules.size);
    expect(layout.nodes.every((node) => node.parentId === undefined)).toBe(
      true,
    );
    expect(layout.nodes.every((node) => node.width === 180)).toBe(true);
    expect(layout.edges).toHaveLength(model.observedEdges.length);
  });

  it('collapses oversized layers and restores their modules on expansion', () => {
    const model = buildLaymosModulesModel(complexModulesFixtureReport);
    const active = getActiveModulesModel(model, null, null);
    const collapsed = computeModuleGraphLayout(model, active);
    const cluster = collapsed.nodes.find(
      (node) => node.type === 'module-cluster',
    );

    expect(cluster).toBeDefined();
    expect(collapsed.nodes.length).toBeLessThan(model.modules.size);

    const expanded = computeModuleGraphLayout(
      model,
      active,
      new Set([cluster!.data.clusterId as string]),
    );
    expect(expanded.nodes.length).toBeGreaterThan(collapsed.nodes.length);
  });

  it('lays acyclic imports out from top to bottom', () => {
    const model = buildLaymosModulesModel(denseModulesFixtureReport);
    const layout = computeModuleGraphLayout(
      model,
      getActiveModulesModel(model, null, null),
    );
    const positionById = new Map(
      layout.nodes.map((node) => [node.id, node.position.y]),
    );

    for (const edge of layout.edges) {
      expect(positionById.get(edge.source)).toBeLessThan(
        positionById.get(edge.target)!,
      );
    }
  });

  it('keeps layout coordinates finite for cyclic module imports', () => {
    const model = buildLaymosModulesModel(laymosModulesFixtureReport);
    const layout = computeModuleGraphLayout(
      model,
      getActiveModulesModel(
        model,
        { path: 'src/application/home', depth: 'transitive' },
        null,
      ),
    );

    for (const node of layout.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
    expect(layout.edges.some((edge) => edge.style?.opacity === 1)).toBe(true);
  });

  it('keeps the selection active while spotlighting a hovered module', () => {
    const model = buildLaymosModulesModel(laymosModulesFixtureReport);
    const active = getActiveModulesModel(
      model,
      { path: 'src/application/home', depth: 'direct' },
      'src/domain/order',
    );
    const layout = computeModuleGraphLayout(model, active);
    const hovered = layout.nodes.find(
      (node) => node.id === 'module:src/domain/order',
    );
    const selected = layout.nodes.find(
      (node) => node.id === 'module:src/application/home',
    );

    expect(hovered?.data.highlighted).toBe(true);
    expect(hovered?.data.muted).toBe(false);
    expect(selected?.data.selected).toBe(true);
    expect(selected?.data.muted).toBe(false);

    const touchingHovered = layout.edges.filter(
      (edge) =>
        edge.source === 'module:src/domain/order' ||
        edge.target === 'module:src/domain/order',
    );
    expect(touchingHovered.length).toBeGreaterThan(0);
    expect(touchingHovered.every((edge) => edge.style?.opacity === 1)).toBe(
      false,
    );
    const activeEdges = layout.edges.filter(
      (edge) => edge.style?.opacity === 1,
    );
    expect(activeEdges).toHaveLength(1);
    expect(activeEdges[0]?.source).toBe('module:src/application/home');
    expect(activeEdges[0]?.target).toBe('module:src/domain/order');
    expect(selected?.data.highlighted).toBe(true);
    expect(hovered?.data.highlighted).toBe(true);
    expect(layout.edges.some((edge) => edge.style?.opacity === 0.38)).toBe(
      true,
    );
    expect(layout.edges.some((edge) => edge.style?.opacity === 0.06)).toBe(
      true,
    );
  });

  it('keeps every edge active in the default overview', () => {
    const model = buildLaymosModulesModel(laymosModulesFixtureReport);
    const layout = computeModuleGraphLayout(
      model,
      getActiveModulesModel(model, null, null),
    );

    expect(layout.edges.every((edge) => edge.style?.opacity === 1)).toBe(true);
  });
});
