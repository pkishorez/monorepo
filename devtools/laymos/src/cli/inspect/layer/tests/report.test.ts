import { describe, expect, test } from 'vitest';

import { renderLayerInspection } from '../report.js';

describe('renderLayerInspection', () => {
  test('renders one Layer summary', () => {
    const rendered = renderLayerInspection({
      id: 'domain',
      definition: { paths: ['src/domain'], description: 'Domain' },
      files: ['src/domain/order/index.ts'],
      allowedDependencies: ['contract'],
      allowedDependents: ['app'],
      modules: [
        {
          path: 'src/domain/order',
          layer: 'domain',
          shared: true,
          exposed: false,
          shape: 'directory',
          observedKind: 'terminal',
        },
      ],
      moduleGraphs: [],
      sharedCount: 1,
      hasNoModules: false,
      layerViolations: [],
      moduleViolations: [],
    });

    expect(rendered).toContain('Layer: domain');
    expect(rendered).toContain('May depend on: contract');
    expect(rendered).toContain(
      'src/domain/order (shared, directory, terminal)',
    );
    expect(rendered).toContain('Module Graphs: 0');
  });

  test('counts a Layer without Modules as a violation', () => {
    const rendered = renderLayerInspection({
      id: 'empty',
      definition: { paths: ['src/empty'] },
      files: [],
      allowedDependencies: [],
      allowedDependents: [],
      modules: [],
      moduleGraphs: [],
      sharedCount: 0,
      hasNoModules: true,
      layerViolations: [],
      moduleViolations: [],
    });

    expect(rendered).toContain('Violations: 1');
  });
});
