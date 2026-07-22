import { describe, expect, it } from 'vitest';

import { moduleArchitectureReport } from '../fixtures/reports';
import { buildModuleGraphModel, moduleEdgeKey } from './model';
import { getModuleGraphSelection } from './selection';

const model = buildModuleGraphModel(moduleArchitectureReport);

describe('module graph selection', () => {
  it('reveals only immediate incoming and outgoing imports in direct mode', () => {
    const active = getModuleGraphSelection(
      model,
      { path: 'src/application/orders', depth: 'direct' },
      null,
    );

    expect(active.visibleModules).toEqual(
      new Set([
        'src/application/orders',
        'src/ui/orders',
        'src/domain/orders',
        'src/domain/accounts',
      ]),
    );
    expect(active.visibleEdges).toHaveLength(3);
    expect(active.incomingCount).toBe(1);
    expect(active.outgoingCount).toBe(2);
  });

  it('reveals the complete reachable neighborhood in transitive mode', () => {
    const active = getModuleGraphSelection(
      model,
      { path: 'src/ui/orders', depth: 'transitive' },
      null,
    );

    expect(active.visibleModules).toEqual(
      new Set([
        'src/ui/orders',
        'src/application/orders',
        'src/domain/orders',
        'src/domain/accounts',
      ]),
    );
    expect(active.maximumDepth).toBe(2);
    expect(active.outgoingCount).toBe(3);
  });

  it('focuses only visible edges incident to the hovered module', () => {
    const active = getModuleGraphSelection(
      model,
      { path: 'src/ui/orders', depth: 'transitive' },
      'src/domain/orders',
    );

    expect(active.focusedEdges).toEqual(
      new Set([
        moduleEdgeKey('src/application/orders', 'src/domain/orders'),
        moduleEdgeKey('src/domain/orders', 'src/domain/accounts'),
      ]),
    );
  });

  it('can exclude connections between modules in the same layer', () => {
    const active = getModuleGraphSelection(
      model,
      { path: 'src/domain/accounts', depth: 'direct' },
      null,
      'cross-layer',
    );

    expect(active.visibleEdges).toHaveLength(3);
    expect(
      active.visibleEdges.has(
        moduleEdgeKey('src/domain/orders', 'src/domain/accounts'),
      ),
    ).toBe(false);
  });
});
