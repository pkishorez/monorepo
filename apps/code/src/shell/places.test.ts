import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  home,
  machine,
  project,
  root,
  type Route,
  session,
  settings,
} from '../places/index.ts';
import { router } from './actor.ts';

describe('places', () => {
  it('are the Routes the router makes', () => {
    expect(root()).toEqual(router.Open());
    expect(machine('m1')).toEqual(router.Machine({ machineId: 'm1' }));
    expect(home('m1')).toEqual(router.Machine.Home({ machineId: 'm1' }));
    expect(settings('m1')).toEqual(
      router.Machine.Settings({ machineId: 'm1' }),
    );
    expect(project('m1', 'p1')).toEqual(
      router.Machine.Project({ machineId: 'm1', projectId: 'p1' }),
    );
    expect(session('m1', 'p1', 's1')).toEqual(
      router.Machine.Project.Session({
        machineId: 'm1',
        projectId: 'p1',
        sessionId: 's1',
      }),
    );
  });

  it('are at their paths', () => {
    expect(router.path(root())).toBe('/');
    expect(router.path(home('m1'))).toBe('/m/m1');
    expect(router.path(session('m1', 'p1', 's1'))).toBe('/m/m1/p/p1/s/s1');
    expect(router.read('/m/m1').route).toEqual(home('m1'));
  });

  it('name every Route the router reads', () => {
    expectTypeOf<Route>().toEqualTypeOf<typeof router.route.Type>();
  });
});
