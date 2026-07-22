import { describe, expect, it } from 'vitest';

import { laymosModulesFixtureReport } from '../../laymos-modules/fixtures/reports';
import {
  buildLaymosModulesModel,
  moduleEdgeKey,
} from '../../laymos-modules/lib/model';
import { getTreeActiveModulesModel } from './connectivity';

const model = buildLaymosModulesModel(laymosModulesFixtureReport);
const home = 'src/application/home';

describe('getTreeActiveModulesModel', () => {
  it('expands the hovered connected module downstream', () => {
    const active = getTreeActiveModulesModel(
      model,
      { path: home, depth: 'direct' },
      'src/domain/order',
    );

    expect(
      active.visibleEdgeKeys.has(
        moduleEdgeKey('src/domain/order', 'src/platform/log'),
      ),
    ).toBe(true);
    expect(
      active.focusedEdgeKeys.has(
        moduleEdgeKey('src/domain/order', 'src/domain/user'),
      ),
    ).toBe(true);
    expect(active.visibleModules.has('src/platform/log')).toBe(true);
  });

  it('does not expand a module outside the selected neighborhood', () => {
    const active = getTreeActiveModulesModel(
      model,
      { path: home, depth: 'direct' },
      'src/application/empty',
    );

    expect(
      active.visibleEdgeKeys.has(
        moduleEdgeKey('src/domain/order', 'src/platform/log'),
      ),
    ).toBe(false);
  });

  it('preserves the route when exploration advances to a transitive module', () => {
    const active = getTreeActiveModulesModel(
      model,
      { path: home, depth: 'direct' },
      'src/platform/log',
    );

    expect(
      active.visibleEdgeKeys.has(
        moduleEdgeKey('src/domain/order', 'src/platform/log'),
      ),
    ).toBe(true);
    expect(active.visibleModules.has('src/domain/order')).toBe(true);
  });
});
