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

  it('clusters modules into groups within their inferred layer', () => {
    const report: LaymosReport = {
      ...moduleArchitectureReport,
      architecture: {
        ...moduleArchitectureReport.architecture,
        moduleGroups: {
          'domain-core': {
            description: 'Core domain modules',
            modules: ['src/domain/orders', 'src/domain/accounts'],
          },
        },
      },
    };
    const model = buildModuleGraphModel(report);

    const group = model.groups.get('domain-core');
    expect(group?.layer).toBe('domain');
    expect(group?.description).toBe('Core domain modules');
    expect(group?.modulePaths).toEqual([
      'src/domain/accounts',
      'src/domain/orders',
    ]);
    expect(group?.violationCount).toBe(1);
    expect(model.groupByModule.get('src/domain/orders')).toBe('domain-core');
    expect(model.layers.get('domain')?.groupNames).toEqual(['domain-core']);
  });

  it('leaves group membership empty when none is configured', () => {
    const model = buildModuleGraphModel(moduleArchitectureReport);

    expect(model.groups.size).toBe(0);
    expect(model.groupByModule.size).toBe(0);
    expect(model.layers.get('domain')?.groupNames).toEqual([]);
  });
});
