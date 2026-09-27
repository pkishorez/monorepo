import { describe, expect, test } from 'vitest';

import type { Module } from '../analysis-presentation';
import { moduleSourceRequest } from './module-source';

const modules: readonly Module[] = [
  {
    id: 'src/domain/orders',
    layerId: 'domain',
    shared: false,
    exposed: true,
    kind: 'regular',
  },
];

const members: readonly Module[] = [
  {
    id: 'src/domain/orders/events',
    layerId: 'domain',
    shared: false,
    exposed: false,
    kind: 'terminal',
    graphId: 'orders',
    member: 'events',
  },
];

describe('moduleSourceRequest', () => {
  test('opens a Configured Module directly', () => {
    expect(moduleSourceRequest(modules, 'src/domain/orders')).toEqual({
      title: 'src/domain/orders',
      pathPrefixes: ['src/domain/orders'],
      scope: { kind: 'module', modulePath: 'src/domain/orders' },
    });
  });

  test('opens a Module Graph member as its own Module', () => {
    expect(moduleSourceRequest(members, 'src/domain/orders/events')).toEqual({
      title: 'src/domain/orders/events',
      pathPrefixes: ['src/domain/orders/events'],
      scope: { kind: 'module', modulePath: 'src/domain/orders/events' },
    });
  });

  test('ignores a path that is not a Configured Module', () => {
    expect(
      moduleSourceRequest(modules, 'src/domain/orders/internal.ts'),
    ).toBeUndefined();
  });
});
