import { describe, it, expect } from 'vitest';
import { buildLayerGrid, buildLayerModel } from './index';
import type { VisualizationConfig } from '../types';

const SIMPLE_CONFIG: VisualizationConfig = {
  rootDir: '.',
  stacks: [
    {
      name: 'web',
      allowedImports: [],
      layers: [
        { name: 'routes', paths: ['src/routes'] },
        { name: 'services', paths: ['src/services'] },
        { name: 'data', paths: ['src/data'] },
      ],
    },
  ],
  modules: [],
};

const PARALLEL_CONFIG: VisualizationConfig = {
  rootDir: '.',
  stacks: [
    {
      name: 'web',
      allowedImports: [],
      layers: [
        { name: 'routes', paths: ['src/routes'] },
        { name: 'shared', paths: ['src/shared'] },
        { name: 'data', paths: ['src/data'] },
      ],
    },
    {
      name: 'api',
      allowedImports: [],
      layers: [
        { name: 'controllers', paths: ['src/controllers'] },
        { name: 'shared', paths: ['src/shared'] },
        { name: 'db', paths: ['src/db'] },
      ],
    },
  ],
  modules: [],
};

describe('buildLayerModel', () => {
  it('returns one slot per layer for a single stack', () => {
    const model = buildLayerModel(SIMPLE_CONFIG);
    expect(model.slots).toHaveLength(3);
    expect(model.slots.map((s) => s.sections.map((sec) => sec.layer))).toEqual([
      ['routes'],
      ['services'],
      ['data'],
    ]);
  });

  it('assigns sequential index to each slot', () => {
    const model = buildLayerModel(SIMPLE_CONFIG);
    expect(model.slots.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('each section carries the layer paths', () => {
    const model = buildLayerModel(SIMPLE_CONFIG);
    expect(model.slots[0]!.sections[0]!.paths).toEqual(['src/routes']);
  });

  it('parallel stacks at the same level produce multiple sections in one slot', () => {
    const model = buildLayerModel(PARALLEL_CONFIG);
    // slot 0: routes + controllers (level 0 per each stack)
    // slot 1: shared (shared layer - appears in both stacks, same level 1)
    // slot 2: data + db (level 2 per each stack)
    const sectionCounts = model.slots.map((s) => s.sections.length);
    expect(sectionCounts).toEqual([2, 1, 2]);
  });

  it('shared layer appears as a single section not duplicated', () => {
    const model = buildLayerModel(PARALLEL_CONFIG);
    const allSections = model.slots.flatMap((s) => s.sections);
    const sharedSections = allSections.filter((s) => s.layer === 'shared');
    expect(sharedSections).toHaveLength(1);
  });

  it('each section modules is empty when no summary provided', () => {
    const model = buildLayerModel(SIMPLE_CONFIG);
    for (const slot of model.slots) {
      for (const section of slot.sections) {
        expect(section.modules).toEqual([]);
      }
    }
  });

  it('section modules contains ModuleNodes for that layer when modules provided', () => {
    const config: VisualizationConfig = {
      ...SIMPLE_CONFIG,
      modules: [
        {
          path: 'src/routes/home',
          layer: 'routes',
          name: 'home',
          visibility: 'public',
          feature: 'home-page',
        },
        {
          path: 'src/routes/about',
          layer: 'routes',
          name: 'about',
          visibility: 'private',
        },
        {
          path: 'src/services/auth',
          layer: 'services',
          name: 'auth',
          visibility: 'shared',
          feature: 'auth',
        },
      ],
    };
    const model = buildLayerModel(config);
    const routesSection = model.slots[0]!.sections[0]!;
    expect(routesSection.layer).toBe('routes');
    expect(routesSection.modules.map((m) => m.name)).toEqual(
      expect.arrayContaining(['home', 'about']),
    );
    const servicesSection = model.slots[1]!.sections[0]!;
    expect(servicesSection.modules.map((m) => m.name)).toEqual(['auth']);
  });
});

describe('buildLayerGrid', () => {
  it('puts a single stack on one row with sequential columns', () => {
    const grid = buildLayerGrid(SIMPLE_CONFIG);
    expect(grid.stackRows).toEqual(['web']);
    expect(grid.columnCount).toBe(3);
    expect(
      grid.cards.map((c) => [c.layer, c.column, c.rowStart, c.rowSpan]),
    ).toEqual([
      ['routes', 0, 0, 1],
      ['services', 1, 0, 1],
      ['data', 2, 0, 1],
    ]);
  });

  it('gives each stack its own row', () => {
    const grid = buildLayerGrid(PARALLEL_CONFIG);
    expect(grid.stackRows).toEqual(['web', 'api']);
    const routes = grid.cards.find((c) => c.layer === 'routes')!;
    const controllers = grid.cards.find((c) => c.layer === 'controllers')!;
    expect(routes.rowStart).toBe(0);
    expect(controllers.rowStart).toBe(1);
  });

  it('spans a shared layer across the rows of its stacks', () => {
    const grid = buildLayerGrid(PARALLEL_CONFIG);
    const shared = grid.cards.find((c) => c.layer === 'shared')!;
    expect(shared.rowStart).toBe(0);
    expect(shared.rowSpan).toBe(2);
    expect(shared.stacks).toEqual(['web', 'api']);
  });

  it('keeps a non-shared layer on a single row', () => {
    const grid = buildLayerGrid(PARALLEL_CONFIG);
    const data = grid.cards.find((c) => c.layer === 'data')!;
    expect(data.rowSpan).toBe(1);
    expect(data.stacks).toEqual(['web']);
  });
});
