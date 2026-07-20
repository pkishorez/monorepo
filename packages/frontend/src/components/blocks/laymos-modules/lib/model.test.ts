import { describe, expect, it } from 'vitest';

import { laymosModulesFixtureReport } from '../fixtures/reports';
import { buildLaymosModulesModel, moduleEdgeKey } from './model';

const model = buildLaymosModulesModel(laymosModulesFixtureReport);

describe('laymos modules model', () => {
  it('assigns declared and empty modules to layers with relative labels', () => {
    expect(model.modules.get('src/application/home')).toMatchObject({
      layer: 'application',
      label: 'home',
      files: ['src/application/home/index.ts'],
    });
    expect(model.modules.get('src/application/empty')).toMatchObject({
      layer: 'application',
      label: 'empty',
      files: [],
    });
  });

  it('aggregates exact observed imports and marks violating pairs', () => {
    expect(
      model.observedEdgeByKey.get(
        moduleEdgeKey('src/domain/order', 'src/platform/log'),
      ),
    ).toMatchObject({
      violating: true,
      fileEdges: [
        {
          from: 'src/domain/order/index.ts',
          to: 'src/platform/log/index.ts',
          violating: true,
        },
      ],
    });
  });

  it('keeps unassigned files as boundary evidence instead of modules', () => {
    expect(model.modules.has('src/application/shared.ts')).toBe(false);
    expect(model.modules.get('src/application/home')?.boundaryEdges).toEqual([
      {
        direction: 'outgoing',
        from: 'src/application/home/index.ts',
        to: 'src/application/shared.ts',
      },
      {
        direction: 'incoming',
        from: 'src/application/shared.ts',
        to: 'src/application/home/index.ts',
      },
    ]);
  });

  it('retains configured permissions separately from observed edges', () => {
    expect(model.modules.get('src/domain/order')?.rules).toEqual({
      module: 'src/domain/order',
      canImport: ['src/domain/user'],
    });
    expect(
      model.observedEdgeByKey.has(
        moduleEdgeKey('src/application/admin', 'src/application/home'),
      ),
    ).toBe(true);
  });
});
