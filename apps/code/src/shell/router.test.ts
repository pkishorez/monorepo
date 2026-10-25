import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  home,
  project,
  type Route,
  session,
  settings,
} from './places/index.ts';
import { router } from './router.ts';

describe('places', () => {
  it('are the Routes the router makes', () => {
    expect(home()).toEqual(router.Home());
    expect(settings()).toEqual(router.Settings());
    expect(project('m1', 'p1')).toEqual(
      router.Project({ machineId: 'm1', projectId: 'p1' }),
    );
    expect(session('m1', 'p1', 's1')).toEqual(
      router.Project.Session({
        machineId: 'm1',
        projectId: 'p1',
        sessionId: 's1',
      }),
    );
  });

  it('are at their paths', () => {
    expect(router.path(home())).toBe('/');
    expect(router.path(settings())).toBe('/settings');
    expect(router.path(session('m1', 'p1', 's1'))).toBe('/m/m1/p/p1/s/s1');
    expect(router.read('/settings').route).toEqual(settings());
  });

  it('name every Route the router reads', () => {
    expectTypeOf<Route>().toEqualTypeOf<typeof router.route.Type>();
  });
});
