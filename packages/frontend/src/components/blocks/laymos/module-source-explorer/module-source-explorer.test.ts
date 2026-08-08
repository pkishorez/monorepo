import { describe, expect, test } from 'vitest';

import type { Module } from '../modules/model';
import { moduleSourceRequest } from './module-source-explorer';

const modules: readonly Module[] = [
  {
    id: 'src/domain/orders',
    layerId: 'domain',
    shared: false,
    kind: 'regular',
    nested: [
      {
        id: 'src/domain/orders/events',
        path: 'events',
      },
    ],
  },
];

describe('moduleSourceRequest', () => {
  test('opens a Configured Module directly', () => {
    expect(moduleSourceRequest(modules, 'src/domain/orders')).toEqual({
      modulePath: 'src/domain/orders',
    });
  });

  test('opens a nested public entry point in its owning Module', () => {
    expect(moduleSourceRequest(modules, 'src/domain/orders/events')).toEqual({
      modulePath: 'src/domain/orders',
      initialFilePath: 'src/domain/orders/events/index.ts',
    });
  });
});
