import { describe, it, expect } from 'vitest';
import { computeLayerLayout } from './layer-layout';
import type { VisualizationConfig, VizSummary } from '../../model';

const CONFIG: VisualizationConfig = {
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
    {
      name: 'api',
      allowedImports: [],
      layers: [
        { name: 'controllers', paths: ['src/controllers'] },
        { name: 'services', paths: ['src/services'] },
        { name: 'db', paths: ['src/db'] },
      ],
    },
  ],
  modules: [
    {
      path: 'src/routes/home',
      layer: 'routes',
      name: 'home',
      barrel: false,
    },
    {
      path: 'src/services/auth',
      layer: 'services',
      name: 'auth',
      barrel: false,
    },
  ],
};

const SUMMARY: VizSummary = {
  violations: [
    {
      from: 'routes',
      to: 'data',
      fromFile: 'src/routes/home.ts',
      toFile: 'src/data/db.ts',
      rule: 'no-forbidden-imports',
      severity: 'error',
    },
  ],
  moduleCoverage: [],
  layerOrphanFiles: [],
  ignoredFiles: [],
  coveredFiles: [],
  coverageGaps: [],
  emptyModules: [],
  conflicts: [],
  moduleEdges: [],
  featureGraphs: [],
  closureViolations: [],
};

describe('computeLayerLayout characterization', () => {
  it('matches snapshot without summary or selection', () => {
    const result = computeLayerLayout(CONFIG);
    expect(result).toMatchSnapshot();
  });

  it('matches snapshot with summary', () => {
    const result = computeLayerLayout(CONFIG, SUMMARY);
    expect(result).toMatchSnapshot();
  });

  it('matches snapshot with selectedLayer', () => {
    const result = computeLayerLayout(CONFIG, undefined, 'routes');
    expect(result).toMatchSnapshot();
  });

  it('draws a violation edge only for the selected violation', () => {
    const result = computeLayerLayout(CONFIG, SUMMARY, null, {
      from: 'routes',
      to: 'data',
    });
    const violationEdges = result.edges.filter((e) =>
      e.id.startsWith('violation:'),
    );
    expect(violationEdges).toHaveLength(1);
    expect(violationEdges[0]).toMatchObject({
      source: 'routes',
      target: 'data',
    });
  });

  it('draws no violation edges without a selected violation', () => {
    const result = computeLayerLayout(CONFIG, SUMMARY);
    expect(result.edges.some((e) => e.id.startsWith('violation:'))).toBe(false);
  });
});
