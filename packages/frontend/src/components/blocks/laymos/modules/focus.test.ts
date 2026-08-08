import { describe, expect, test } from 'vitest';

import { resolveModuleFocus } from './focus';
import type { Module } from './model';

const modules: readonly Module[] = [
  {
    id: 'src/app/orders',
    layerId: 'application',
    shared: false,
    kind: 'root',
    nested: [],
  },
  {
    id: 'src/domain/orders',
    layerId: 'domain',
    shared: false,
    kind: 'terminal',
    nested: [{ id: 'src/domain/orders/events', path: 'events' }],
  },
  {
    id: 'src/domain/users',
    layerId: 'domain',
    shared: false,
    kind: 'isolated',
    nested: [],
  },
];

const dependencies = [
  {
    fromModuleId: 'src/app/orders',
    toModuleId: 'src/domain/orders',
    toEntryPointId: 'src/domain/orders/events',
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

  test('nested selection shows only inbound use of that public door', () => {
    const focus = resolveModuleFocus({
      modules,
      dependencies,
      focusedLayerId: 'domain',
      activeModuleId: 'src/domain/orders/events',
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
