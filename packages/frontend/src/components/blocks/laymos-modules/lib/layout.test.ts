import { describe, expect, it } from 'vitest';

import {
  denseModuleArchitectureReport,
  moduleArchitectureReport,
} from '../fixtures/reports';
import { computeModuleGraphLayout } from './layout';
import { buildModuleGraphModel } from './model';
import { getModuleGraphSelection } from './selection';

const model = buildModuleGraphModel(moduleArchitectureReport);
const expanded = new Set(model.layers.keys());

describe('module graph layout', () => {
  it('starts as an expanded orientation view without observed module edges', () => {
    const layout = computeModuleGraphLayout(
      model,
      getModuleGraphSelection(model, null, null),
      expanded,
    );

    expect(
      layout.nodes.filter((node) => node.type === 'module-tile'),
    ).toHaveLength(7);
    expect(layout.edges.some((edge) => edge.id.startsWith('observed:'))).toBe(
      false,
    );
  });

  it('places configured modules in a fallback lane when graphs are absent', () => {
    const report = {
      ...moduleArchitectureReport,
      architecture: {
        ...moduleArchitectureReport.architecture,
        graphs: [],
      },
    };
    const graphlessModel = buildModuleGraphModel(report);
    const layout = computeModuleGraphLayout(
      graphlessModel,
      getModuleGraphSelection(graphlessModel, null, null),
      new Set(graphlessModel.layers.keys()),
    );

    expect(layout.nodes.some((node) => node.id === 'graph:Modules')).toBe(true);
    expect(
      layout.nodes.filter((node) => node.type === 'module-tile'),
    ).toHaveLength(7);
  });

  it('keeps a shared layer as one container spanning both graph lanes', () => {
    const layout = computeModuleGraphLayout(
      model,
      getModuleGraphSelection(model, null, null),
      expanded,
    );
    const shared = layout.nodes.find((node) => node.id === 'layer:domain')!;
    const ui = layout.nodes.find((node) => node.id === 'layer:ui')!;

    expect(shared.width).toBeGreaterThan(ui.width!);
    expect(
      layout.nodes.filter((node) => node.id === 'layer:domain'),
    ).toHaveLength(1);
  });

  it('aggregates selected connections at a collapsed layer boundary', () => {
    const layout = computeModuleGraphLayout(
      model,
      getModuleGraphSelection(
        model,
        { path: 'src/application/orders', depth: 'direct' },
        null,
      ),
      new Set(['ui', 'application', 'jobs']),
    );

    expect(
      layout.nodes.some(
        (node) =>
          node.type === 'module-tile' &&
          (node.data as { layer: string }).layer === 'domain',
      ),
    ).toBe(false);
    expect(
      layout.edges.some(
        (edge) =>
          edge.id.startsWith('observed:') && edge.target === 'layer:domain',
      ),
    ).toBe(true);
  });

  it('keeps disclosed edges below module tiles and out of hit testing', () => {
    const layout = computeModuleGraphLayout(
      model,
      getModuleGraphSelection(
        model,
        { path: 'src/application/orders', depth: 'transitive' },
        'src/domain/accounts',
      ),
      expanded,
    );
    const edges = layout.edges.filter((edge) =>
      edge.id.startsWith('observed:'),
    );

    expect(edges.length).toBeGreaterThan(0);
    expect(
      edges.every(
        (edge) =>
          edge.zIndex! < 4 &&
          edge.selectable === false &&
          edge.focusable === false &&
          edge.className === 'pointer-events-none',
      ),
    ).toBe(true);
  });

  it('keeps layer geometry stable when contents are minimised', () => {
    const active = getModuleGraphSelection(model, null, null);
    const expandedLayout = computeModuleGraphLayout(model, active, expanded);
    const collapsedLayout = computeModuleGraphLayout(model, active, new Set());
    const geometry = (layout: typeof expandedLayout) =>
      layout.nodes
        .filter((node) => node.type === 'module-layer-container')
        .map(({ id, position, width, height }) => ({
          id,
          position,
          width,
          height,
        }));

    expect(geometry(collapsedLayout)).toEqual(geometry(expandedLayout));
  });

  it('keeps layer container geometry out of pointer hit testing', () => {
    const layout = computeModuleGraphLayout(
      model,
      getModuleGraphSelection(model, null, null),
      expanded,
    );
    const layers = layout.nodes.filter(
      (node) => node.type === 'module-layer-container',
    );

    expect(layers.every((node) => node.style?.pointerEvents === 'none')).toBe(
      true,
    );
  });

  it('packs dense module tiles into centred rounded rows', () => {
    const denseModel = buildModuleGraphModel(denseModuleArchitectureReport);
    const layout = computeModuleGraphLayout(
      denseModel,
      getModuleGraphSelection(denseModel, null, null),
      new Set(denseModel.layers.keys()),
    );
    const entryTiles = layout.nodes.filter(
      (node) =>
        node.type === 'module-tile' &&
        (node.data as { layer: string }).layer === 'entry',
    );
    const rows = Map.groupBy(entryTiles, (node) => node.position.y);
    const rowSizes = [...rows.values()].map((row) => row.length);
    const entryLayer = layout.nodes.find((node) => node.id === 'layer:entry')!;

    expect(rowSizes[0]).toBe(1);
    expect(rowSizes.at(-1)).toBe(1);
    expect(Math.max(...rowSizes)).toBeGreaterThan(1);
    expect(entryLayer.width).toBeGreaterThan(360);
    expect(entryLayer.height).toBeLessThan(entryLayer.width!);
  });

  it('arranges intra-layer imports from top to bottom in tree mode', () => {
    const layout = computeModuleGraphLayout(
      model,
      getModuleGraphSelection(model, null, null),
      expanded,
      'tree',
    );
    const orders = layout.nodes.find(
      (node) => node.id === 'module:src/domain/orders',
    )!;
    const accounts = layout.nodes.find(
      (node) => node.id === 'module:src/domain/accounts',
    )!;

    expect(orders.position.y).toBeLessThan(accounts.position.y);
    expect(layout.edges.some((edge) => edge.id.startsWith('observed:'))).toBe(
      false,
    );
  });

  it('discloses selected tree edges without changing tree positions', () => {
    const selected = { path: 'src/domain/orders', depth: 'direct' } as const;
    const shown = computeModuleGraphLayout(
      model,
      getModuleGraphSelection(model, selected, null),
      expanded,
      'tree',
    );
    const hidden = computeModuleGraphLayout(
      model,
      getModuleGraphSelection(model, null, null),
      expanded,
      'tree',
    );
    const positions = (layout: typeof shown) =>
      layout.nodes
        .filter((node) => node.type === 'module-tile')
        .map(({ id, position }) => ({ id, position }));

    expect(positions(hidden)).toEqual(positions(shown));
    expect(
      shown.nodes
        .filter((node) => node.type === 'module-tile')
        .every(
          (node) =>
            !(node.data as { selected: boolean }).selected &&
            !(node.data as { dimmed: boolean }).dimmed,
        ),
    ).toBe(true);
    expect(
      shown.edges.some(
        (edge) =>
          edge.source === 'module:src/domain/orders' &&
          edge.target === 'module:src/domain/accounts',
      ),
    ).toBe(true);
    expect(
      hidden.edges.some(
        (edge) =>
          edge.source === 'module:src/domain/orders' &&
          edge.target === 'module:src/domain/accounts',
      ),
    ).toBe(false);
  });

  it('packs an overfull tree level into several compact rows', () => {
    const denseModel = buildModuleGraphModel(denseModuleArchitectureReport);
    const layout = computeModuleGraphLayout(
      denseModel,
      getModuleGraphSelection(denseModel, null, null),
      new Set(denseModel.layers.keys()),
      'tree',
    );
    const entryTiles = layout.nodes.filter(
      (node) =>
        node.type === 'module-tile' &&
        (node.data as { layer: string }).layer === 'entry',
    );
    const visualRows = new Set(entryTiles.map((node) => node.position.y));
    const entryLayer = layout.nodes.find((node) => node.id === 'layer:entry')!;

    expect(visualRows.size).toBeGreaterThan(1);
    expect(entryLayer.width).toBeLessThan(
      entryTiles.length * (entryTiles[0]!.width ?? 0),
    );
  });
});
