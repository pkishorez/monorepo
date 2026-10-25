import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  home,
  project,
  type Route,
  session,
  settings,
} from './routes/index.ts';
import { router } from './router.ts';

describe('routes', () => {
  it('are the Routes the router makes', () => {
    expect(home()).toEqual(router.Home());
    expect(settings()).toEqual(router.Settings.General());
    expect(settings('Shortcuts')).toEqual(router.Settings.Shortcuts());
    expect(settings('Machines')).toEqual(router.Settings.Machines());
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
    expect(router.path(settings())).toBe('/settings/general');
    expect(router.path(settings('Shortcuts'))).toBe('/settings/shortcuts');
    expect(router.path(settings('Machines'))).toBe('/settings/machines');
    expect(router.path(session('m1', 'p1', 's1'))).toBe('/m/m1/p/p1/s/s1');
    expect(router.read('/settings/machines').route).toEqual(
      settings('Machines'),
    );
  });

  it('open Settings on General at `/settings`', () => {
    expect(router.read('/settings')).toEqual({
      _tag: 'Redirect',
      route: settings(),
    });
  });

  it('name every Route the router reads', () => {
    expectTypeOf<Route>().toEqualTypeOf<typeof router.route.Type>();
  });
});
