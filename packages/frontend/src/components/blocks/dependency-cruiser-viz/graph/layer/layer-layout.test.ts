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
      visibility: 'public',
      feature: 'home',
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
  breaches: [],
  layerOrphanFiles: [],
  ignoredFiles: [],
  coveredFiles: [],
  coverageGaps: [],
  featureEdges: [],
  featureModuleEdges: [],
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
});
