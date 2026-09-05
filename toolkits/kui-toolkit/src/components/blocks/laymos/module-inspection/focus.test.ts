import { describe, expect, test } from 'vitest';

import { resolveModuleFocus } from './focus';
import type { Module } from '../analysis-presentation';

const modules: readonly Module[] = [
  {
    id: 'src/app/orders',
    layerId: 'application',
    shared: false,
    kind: 'root',
    exposed: true,
  },
  {
    id: 'src/domain/orders',
    layerId: 'domain',
    shared: false,
    kind: 'terminal',
    exposed: true,
  },
  {
    id: 'src/domain/users',
    layerId: 'domain',
    shared: false,
    kind: 'isolated',
    exposed: true,
  },
];

const dependencies = [
  {
    fromModuleId: 'src/app/orders',
    toModuleId: 'src/domain/orders',
    toEntryPointId: 'src/domain/orders',
    permitted: true,
  },
] as const;

describe('resolveModuleFocus', () => {
  test('reveals directly connected modules while keeping every layer visible', () => {
    const focus = resolveModuleFocus({
      modules,
      dependencies,
      focusedLayerId: 'application',
      activeModuleId: 'src/app/orders',
    });

    expect(focus.visibleLayerIds).toEqual(new Set(['application', 'domain']));
    expect(focus.highlightedModuleIds).toEqual(
      new Set(['src/app/orders', 'src/domain/orders']),
    );
  });

  test('selecting the target module keeps its inbound dependency', () => {
    const focus = resolveModuleFocus({
      modules,
      dependencies,
      focusedLayerId: 'domain',
      activeModuleId: 'src/domain/orders',
    });

    expect(focus.dependencies).toEqual(dependencies);
    expect(focus.selectedModuleId).toBe('src/domain/orders');
  });

  test('keeps all layers visible without clearing focus', () => {
    const focus = resolveModuleFocus({
      modules,
      dependencies,
      focusedLayerId: 'application',
      activeModuleId: 'src/app/orders',
    });

    expect(focus.visibleLayerIds).toEqual(new Set(['application', 'domain']));
    expect(focus.selectedModuleId).toBe('src/app/orders');
  });

  test('shows every layer without emphasis when nothing is selected', () => {
    const focus = resolveModuleFocus({
      modules,
      dependencies,
    });

    expect(focus.visibleLayerIds).toEqual(new Set(['application', 'domain']));
    expect(focus.highlightedModuleIds).toEqual(new Set());
  });
});
