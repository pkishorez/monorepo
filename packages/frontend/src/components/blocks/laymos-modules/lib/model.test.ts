import { describe, expect, it } from 'vitest';
import type { LaymosReport } from 'laymos/report';

import { moduleArchitectureReport } from '../fixtures/reports';
import { buildModuleGraphModel } from './model';

describe('module graph model', () => {
  it('builds modules, observed imports, and shared layer membership', () => {
    const model = buildModuleGraphModel(moduleArchitectureReport);

    expect(model.modules).toHaveLength(7);
    expect(model.edges).toHaveLength(7);
    expect(model.layers.get('domain')?.graphs).toEqual(['web', 'workers']);
    expect(model.layers.get('domain')?.modulePaths).toEqual([
      'src/domain/accounts',
      'src/domain/orders',
    ]);
  });

  it('uses the shortest unique suffix for module labels', () => {
    const model = buildModuleGraphModel(moduleArchitectureReport);

    expect(model.modules.get('src/ui/orders')?.label).toBe('ui/orders');
    expect(model.modules.get('src/domain/orders')?.label).toBe('domain/orders');
  });

  it('marks both ends of a violating module import', () => {
    const model = buildModuleGraphModel(moduleArchitectureReport);

    expect(model.modules.get('src/application/orders')?.violationCount).toBe(1);
    expect(model.modules.get('src/domain/accounts')?.violationCount).toBe(1);
  });

  it('counts every violating file import between the same modules', () => {
    const report: LaymosReport = {
      ...moduleArchitectureReport,
      files: {
        ...moduleArchitectureReport.files,
        'src/application/orders/submit.ts': {
          kind: 'covered',
          layer: 'application',
          module: 'src/application/orders',
          imports: ['src/domain/accounts/index.ts'],
        },
      },
      violations: [
        ...moduleArchitectureReport.violations,
        {
          kind: 'module',
          rule: 'canImport',
          from: {
            module: 'src/application/orders',
            layer: 'application',
            file: 'src/application/orders/submit.ts',
          },
          to: {
            module: 'src/domain/accounts',
            layer: 'domain',
            file: 'src/domain/accounts/index.ts',
          },
        },
      ],
    };
    const model = buildModuleGraphModel(report);

    expect(model.modules.get('src/application/orders')?.violationCount).toBe(2);
    expect(model.modules.get('src/domain/accounts')?.violationCount).toBe(2);
    expect(model.layers.get('application')?.violationCount).toBe(2);
    expect(model.layers.get('domain')?.violationCount).toBe(2);
  });

  it('classifies module roots and sinks from observed directionality', () => {
    const model = buildModuleGraphModel(moduleArchitectureReport);

    expect(model.modules.get('src/ui/orders')).toMatchObject({
      isRoot: true,
      isSink: false,
    });
    expect(model.modules.get('src/domain/accounts')).toMatchObject({
      isRoot: false,
      isSink: true,
    });
  });
});
