import { describe, expect, it } from 'vitest';

import { laymosModulesFixtureReport } from '../fixtures/reports';
import { buildLaymosModulesModel, moduleEdgeKey } from './model';
import {
  canHoverModule,
  getModuleGraphActiveModel,
} from './graph-connectivity';

const model = buildLaymosModulesModel(laymosModulesFixtureReport);

describe('getModuleGraphActiveModel', () => {
  it('keeps left-click scope to immediate children', () => {
    const active = getModuleGraphActiveModel(
      model,
      { path: 'src/application/admin', depth: 'direct' },
      null,
    );

    expect(active.visibleEdgeKeys).toEqual(
      new Set([moduleEdgeKey('src/application/admin', 'src/application/home')]),
    );
  });

  it('includes immediate incoming edges in direct scope', () => {
    const active = getModuleGraphActiveModel(
      model,
      { path: 'src/application/home', depth: 'direct' },
      null,
    );

    expect(
      active.visibleEdgeKeys.has(
        moduleEdgeKey('src/application/admin', 'src/application/home'),
      ),
    ).toBe(true);
    expect(
      active.visibleEdgeKeys.has(
        moduleEdgeKey('src/domain/user', 'src/application/home'),
      ),
    ).toBe(true);
  });

  it('includes the descendant tree for transitive scope', () => {
    const active = getModuleGraphActiveModel(
      model,
      { path: 'src/application/admin', depth: 'transitive' },
      null,
    );

    expect(active.visibleModules.has('src/platform/log')).toBe(true);
    expect(active.visibleEdgeKeys.size).toBeGreaterThan(1);
  });

  it('includes transitive incoming ancestors', () => {
    const active = getModuleGraphActiveModel(
      model,
      { path: 'src/platform/log', depth: 'transitive' },
      null,
    );

    expect(active.visibleModules.has('src/application/admin')).toBe(true);
  });

  it('uses hover as a temporary spotlight without changing selection scope', () => {
    const selection = {
      path: 'src/application/admin',
      depth: 'direct',
    } as const;
    const selected = getModuleGraphActiveModel(model, selection, null);
    const hovered = getModuleGraphActiveModel(
      model,
      selection,
      'src/application/home',
    );
    const restored = getModuleGraphActiveModel(model, selection, null);

    expect(hovered.comparison?.target).toBe('src/application/home');
    expect(hovered.visibleEdgeKeys).toEqual(selected.visibleEdgeKeys);
    expect(restored.comparison).toBeNull();
    expect(restored.visibleEdgeKeys).toEqual(selected.visibleEdgeKeys);
  });

  it('allows hover only inside the selected node set', () => {
    const selection = {
      path: 'src/application/home',
      depth: 'direct',
    } as const;
    const active = getModuleGraphActiveModel(model, selection, null);

    expect(canHoverModule(active, selection, 'src/domain/order')).toBe(true);
    expect(canHoverModule(active, selection, 'src/platform/log')).toBe(false);
    expect(canHoverModule(active, null, 'src/platform/log')).toBe(true);
  });
});
