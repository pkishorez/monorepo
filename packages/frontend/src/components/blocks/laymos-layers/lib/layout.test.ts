import { describe, expect, it } from 'vitest';

import {
  complexLayersFixtureReport,
  laymosLayersFixtureReport,
  siblingLayersFixtureReport,
} from '../fixtures/reports';
import { computeLaymosFlowLayout } from './layout';
import { buildLaymosLayersModel, getActiveModel } from './model';

const model = buildLaymosLayersModel(laymosLayersFixtureReport);

describe('laymos layers layout', () => {
  it('places importers above dependencies and renders a single shared sink', () => {
    const layout = computeLaymosFlowLayout(model, getActiveModel(model, null));
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    expect(nodes.get('layer:routes')!.position.y).toBeLessThan(
      nodes.get('layer:ui')!.position.y,
    );
    expect(nodes.get('layer:ui')!.position.y).toBeLessThan(
      nodes.get('layer:domain')!.position.y,
    );
    expect(
      layout.nodes.filter((node) => node.id === 'layer:domain'),
    ).toHaveLength(1);
  });

  it('shows only configured and graph-membership edges in the overview', () => {
    const layout = computeLaymosFlowLayout(model, getActiveModel(model, null));
    expect(
      layout.edges.every(
        (edge) =>
          edge.id.startsWith('configured:') ||
          edge.id.startsWith('membership:'),
      ),
    ).toBe(true);
  });

  it('connects each graph header to its root layer without an arrow', () => {
    const layout = computeLaymosFlowLayout(model, getActiveModel(model, null));
    expect(
      layout.edges.find((edge) => edge.id === 'membership:web->routes'),
    ).toMatchObject({
      source: 'graph:web',
      target: 'layer:routes',
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
      markerEnd: undefined,
      style: { strokeDasharray: '3 5' },
    });
  });

  it('aggregates graph header file, coverage, and error metadata', () => {
    const layout = computeLaymosFlowLayout(model, getActiveModel(model, null));
    expect(
      layout.nodes.find((node) => node.id === 'graph:web')?.data,
    ).toMatchObject({
      fileCount: 5,
      moduleCoveredFiles: 2,
      moduleTotalFiles: 5,
      violationCount: 1,
    });
  });

  it('highlights a graph block background only while its header is hovered', () => {
    const selectedGraph = getActiveModel(model, {
      kind: 'graph',
      name: 'web',
    });
    const selectedLayout = computeLaymosFlowLayout(model, selectedGraph);
    expect(
      selectedLayout.nodes.find((node) => node.id === 'lane:web')?.data,
    ).toMatchObject({ highlighted: false });

    const hoveredLayout = computeLaymosFlowLayout(
      model,
      selectedGraph,
      null,
      'web',
    );
    expect(
      hoveredLayout.nodes.find((node) => node.id === 'lane:web')?.data,
    ).toMatchObject({ highlighted: true });
    expect(
      hoveredLayout.nodes.find((node) => node.id === 'lane:api')?.data,
    ).toMatchObject({ highlighted: false });
  });

  it('adds exact observed edges when a layer is active', () => {
    const active = getActiveModel(model, { kind: 'layer', name: 'routes' });
    const layout = computeLaymosFlowLayout(model, active);
    expect(layout.edges.map((edge) => edge.id)).toContain(
      'observed:routes->domain',
    );
    expect(layout.edges.map((edge) => edge.id)).toContain(
      'observed:routes->controllers',
    );
    expect(
      layout.edges.filter(
        (edge) => edge.source === 'layer:routes' && edge.target === 'layer:ui',
      ),
    ).toHaveLength(1);
    expect(
      layout.edges.find(
        (edge) => edge.source === 'layer:routes' && edge.target === 'layer:ui',
      )?.label,
    ).toBe('1');
    expect(
      layout.nodes.find((node) => node.id === 'layer:ui')?.data,
    ).toMatchObject({ related: true, dimmed: false });
    expect(
      layout.nodes.find((node) => node.id === 'layer:services')?.data,
    ).toMatchObject({ related: false, dimmed: true });
  });

  it('uses the nearest directional handles', () => {
    const active = getActiveModel(model, { kind: 'layer', name: 'routes' });
    const layout = computeLaymosFlowLayout(model, active);
    const edges = new Map(layout.edges.map((edge) => [edge.id, edge]));

    expect(edges.get('configured:web:routes->ui')).toMatchObject({
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
    });
    expect(edges.get('observed:routes->controllers')).toMatchObject({
      sourceHandle: 'source-right',
      targetHandle: 'target-left',
    });
    expect(edges.get('observed:routes->domain')).toMatchObject({
      sourceHandle: 'source-bottom-right',
      targetHandle: 'target-web',
    });
  });

  it('keeps edges and their labels passive', () => {
    const active = getActiveModel(model, { kind: 'layer', name: 'routes' });
    const layout = computeLaymosFlowLayout(model, active);
    expect(
      layout.edges.every(
        (edge) =>
          edge.interactionWidth === 0 && edge.style?.pointerEvents === 'none',
      ),
    ).toBe(true);
  });

  it('keeps interactive nodes above every edge', () => {
    const active = getActiveModel(model, { kind: 'layer', name: 'routes' });
    const layout = computeLaymosFlowLayout(model, active);
    const highestEdge = Math.max(
      ...layout.edges.map((edge) => edge.zIndex ?? 0),
    );
    const interactiveNodes = layout.nodes.filter(
      (node) => node.type === 'graphHeader' || node.type === 'layer',
    );

    expect(
      interactiveNodes.every((node) => (node.zIndex ?? 0) > highestEdge),
    ).toBe(true);
  });

  it('focuses only selected edges incident to the hovered neighbor', () => {
    const active = getActiveModel(model, { kind: 'layer', name: 'routes' });
    const layout = computeLaymosFlowLayout(model, active, {
      kind: 'layer',
      name: 'ui',
    });
    const edges = new Map(layout.edges.map((edge) => [edge.id, edge]));
    expect(edges.get('configured:web:routes->ui')?.style).toMatchObject({
      strokeWidth: 2.75,
      opacity: 0.9,
    });
    expect(edges.get('observed:routes->domain')?.style).toMatchObject({
      strokeWidth: 2,
      opacity: 0.12,
    });
    expect(edges.get('observed:routes->controllers')?.style).toMatchObject({
      opacity: 0.12,
    });
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    expect(nodes.get('layer:routes')?.data).toMatchObject({
      related: true,
      dimmed: false,
    });
    expect(nodes.get('layer:ui')?.data).toMatchObject({
      related: true,
      dimmed: false,
    });
    expect(nodes.get('layer:domain')?.data).toMatchObject({
      related: false,
      dimmed: true,
    });
  });

  it('does not alter selected edges when hovering outside the selection', () => {
    const active = getActiveModel(model, { kind: 'layer', name: 'routes' });
    const layout = computeLaymosFlowLayout(model, active, {
      kind: 'layer',
      name: 'services',
    });
    expect(
      layout.edges.find((edge) => edge.id === 'observed:routes->domain')?.style,
    ).toMatchObject({ strokeWidth: 2, opacity: 1 });
  });

  it('lays out same-rank siblings side by side', () => {
    const siblingModel = buildLaymosLayersModel(siblingLayersFixtureReport);
    const layout = computeLaymosFlowLayout(
      siblingModel,
      getActiveModel(siblingModel, null),
    );
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    const siblings = ['catalog', 'cart', 'account'].map(
      (layer) => nodes.get(`layer:${layer}`)!,
    );
    expect(new Set(siblings.map((node) => node.position.y)).size).toBe(1);
    expect(new Set(siblings.map((node) => node.position.x)).size).toBe(3);
  });

  it('keeps shared middle layers singular across a complex graph set', () => {
    const complexModel = buildLaymosLayersModel(complexLayersFixtureReport);
    const layout = computeLaymosFlowLayout(
      complexModel,
      getActiveModel(complexModel, {
        kind: 'layer',
        name: 'application',
      }),
    );
    const applicationNodes = layout.nodes.filter(
      (node) => node.id === 'layer:application',
    );
    expect(applicationNodes).toHaveLength(1);
    expect(applicationNodes[0]!.width).toBeGreaterThan(180);
    const billing = layout.nodes.find((node) => node.id === 'layer:billing')!;
    const notifications = layout.nodes.find(
      (node) => node.id === 'layer:notifications',
    )!;
    const domain = layout.nodes.find((node) => node.id === 'layer:domain')!;
    expect(billing.position.y).not.toBe(notifications.position.y);
    expect(domain.position.y).toBeGreaterThan(
      Math.max(billing.position.y, notifications.position.y),
    );
    expect(
      layout.edges.filter((edge) => edge.id.startsWith('membership:')),
    ).toHaveLength(3);
    expect(
      layout.edges.filter(
        (edge) =>
          edge.source === 'layer:domain' && edge.target === 'layer:platform',
      ),
    ).toHaveLength(1);
    expect(
      layout.edges.filter(
        (edge) =>
          edge.source === 'layer:billing' && edge.target === 'layer:domain',
      ),
    ).toHaveLength(1);
  });
});
