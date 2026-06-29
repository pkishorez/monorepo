import { describe, expect, it } from 'vitest';

import {
  feature,
  layer,
  layersTopDown,
  module,
  toVisualizationConfig,
  type VizSummary,
} from 'depcruise-viz';

import {
  buildFeatureLayersModel,
  filterChipModules,
} from './feature-layers-model';
import { allModules } from '../../model';

const config = toVisualizationConfig({
  rootDir: 'src',
  rules: [
    layersTopDown('app', [
      layer('services', ['src/services']),
      layer('domain', ['src/domain']),
    ]),
  ],
  features: [feature('auth', {}), feature('orders', {}), feature('shared', {})],
  modules: [
    module('src/services/auth', { feature: 'auth' }),
    module('src/services/order', { feature: 'orders' }),
    module('src/domain/order', { feature: 'orders' }),
    module('src/domain/types', { feature: 'shared', visibility: 'public' }),
    module('src/domain/logger', { visibility: 'public' }),
  ],
});

const summary: VizSummary = {
  ignoredFiles: [],
  violations: [],
  layerOrphanFiles: [],
  coveredFiles: [],
  moduleCoverage: [
    {
      module: 'auth',
      layer: 'services',
      feature: 'auth',
      visibility: 'private',
      files: ['src/services/auth.ts'],
    },
    {
      module: 'order',
      layer: 'services',
      feature: 'orders',
      visibility: 'private',
      files: ['src/services/order.ts'],
    },
    {
      module: 'order',
      layer: 'domain',
      feature: 'orders',
      visibility: 'private',
      files: ['src/domain/order.ts'],
    },
    {
      module: 'types',
      layer: 'domain',
      feature: 'shared',
      visibility: 'public',
      files: ['src/domain/types.ts'],
    },
    {
      module: 'logger',
      layer: 'domain',
      feature: null as unknown as string,
      visibility: 'public',
      files: ['src/domain/logger.ts'],
    },
  ],
  coverageGaps: [],
  conflicts: [],
  breaches: [
    {
      fromModule: 'auth',
      fromFeature: 'auth',
      toModule: 'logger',
      toFeature: null,
      toVisibility: 'public',
      fromFile: 'src/services/auth.ts',
      toFile: 'src/domain/logger.ts',
      reason: 'private-cross-feature',
    },
  ],
  featureEdges: [],
  featureModuleEdges: [],
};

describe('buildFeatureLayersModel', () => {
  it('returns feature chips ordered by owned-count descending', () => {
    const model = buildFeatureLayersModel(config, summary);
    const ids = model.featureChips.map((c) => c.id);
    // orders owns 2, auth owns 1, shared owns 1
    expect(ids[0]).toBe('orders');
    expect(ids).toContain('auth');
    expect(ids).toContain('shared');
  });

  it('includes all three filter chips', () => {
    const model = buildFeatureLayersModel(config, summary);
    const ids = model.filterChips.map((c) => c.id);
    expect(ids).toEqual(['shared-unowned', 'breached', 'public-surface']);
  });

  it('includes cards from the layer grid', () => {
    const model = buildFeatureLayersModel(config, summary);
    expect(model.layerGrid.cards.length).toBeGreaterThan(0);
    expect(model.layerGrid.stackRows).toEqual(['app']);
  });
});

describe('filterChipModules', () => {
  const modules = allModules(config, summary);

  it('shared-unowned selects modules with feature === null', () => {
    const keys = filterChipModules('shared-unowned', modules);
    expect(keys.has('domain::logger')).toBe(true);
    // auth is owned
    expect(keys.has('services::auth')).toBe(false);
  });

  it('breached selects modules flagged isBreached', () => {
    const keys = filterChipModules('breached', modules);
    // auth and logger are named in breaches
    expect(keys.has('services::auth')).toBe(true);
    expect(keys.has('domain::logger')).toBe(true);
  });

  it('public-surface selects modules with visibility === public', () => {
    const keys = filterChipModules('public-surface', modules);
    expect(keys.has('domain::types')).toBe(true);
    expect(keys.has('domain::logger')).toBe(true);
    expect(keys.has('services::auth')).toBe(false);
  });
});
