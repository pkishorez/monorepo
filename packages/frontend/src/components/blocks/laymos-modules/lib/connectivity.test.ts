import { describe, expect, it } from 'vitest';

import { laymosModulesFixtureReport } from '../fixtures/reports';
import { getActiveModulesModel } from './connectivity';
import { buildLaymosModulesModel, moduleEdgeKey } from './model';

const model = buildLaymosModulesModel(laymosModulesFixtureReport);
const home = 'src/application/home';

describe('laymos module connectivity', () => {
  it('previews only direct incoming and outgoing neighbors', () => {
    const active = getActiveModulesModel(model, null, home);
    expect(active.visibleModules).toEqual(
      new Set([
        home,
        'src/application/admin',
        'src/domain/order',
        'src/domain/user',
      ]),
    );
    expect(
      active.visibleEdgeKeys.has(moduleEdgeKey(home, 'src/domain/order')),
    ).toBe(true);
    expect(
      active.visibleEdgeKeys.has(
        moduleEdgeKey('src/domain/order', 'src/platform/log'),
      ),
    ).toBe(false);
  });

  it('builds separate upstream and downstream transitive neighborhoods', () => {
    const active = getActiveModulesModel(
      model,
      { path: home, depth: 'transitive' },
      null,
    );
    expect(active.incomingDistances.get('src/application/admin')).toBe(1);
    expect(active.outgoingDistances.get('src/platform/log')).toBe(2);
    expect(active.incomingDistances.get('src/domain/user')).toBe(1);
    expect(active.outgoingDistances.get('src/domain/user')).toBe(1);
  });

  it('isolates every equally short route to a transitive comparison', () => {
    const active = getActiveModulesModel(
      model,
      { path: home, depth: 'transitive' },
      'src/platform/log',
    );
    expect(active.comparison).toMatchObject({
      directions: ['outgoing'],
      distance: 2,
      routeCount: 2,
    });
    expect(active.focusedEdgeKeys).toEqual(
      new Set([
        moduleEdgeKey(home, 'src/domain/order'),
        moduleEdgeKey(home, 'src/domain/user'),
        moduleEdgeKey('src/domain/order', 'src/platform/log'),
        moduleEdgeKey('src/domain/user', 'src/platform/log'),
      ]),
    );
  });

  it('does not reveal a transitive path in direct mode', () => {
    const active = getActiveModulesModel(
      model,
      { path: home, depth: 'direct' },
      'src/platform/log',
    );
    expect(active.comparison).toMatchObject({
      directions: [],
      distance: null,
      routeCount: 0,
    });
    expect(active.focusedEdgeKeys.size).toBe(0);
  });
});
