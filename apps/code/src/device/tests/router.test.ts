import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  home,
  openSettingsOn,
  project,
  type Route,
  session,
  settings,
  settingsTabAsked,
} from '../routes/index.ts';
import { router } from '../device.ts';

describe('routes', () => {
  it('are the Routes the router makes', () => {
    expect(home()).toEqual(router.Home());
    expect(settings()).toEqual(router.Settings());
    expect(project('m1', 'p1')).toEqual(
      router.Project({ connectionId: 'm1', projectId: 'p1' }),
    );
    expect(session('m1', 'p1', 's1')).toEqual(
      router.Project.Session({
        connectionId: 'm1',
        projectId: 'p1',
        sessionId: 's1',
      }),
    );
  });

  it('are at their paths', () => {
    expect(router.path(home())).toBe('/');
    expect(router.path(settings())).toBe('/settings');
    expect(router.path(session('m1', 'p1', 's1'))).toBe('/m/m1/p/p1/s/s1');
    expect(router.read('/settings')).toEqual({
      _tag: 'At',
      route: settings(),
    });
  });

  it('open Settings at the addresses their tabs once had', () => {
    for (const path of [
      '/settings/general',
      '/settings/shortcuts',
      '/settings/connections',
    ])
      expect(router.read(path)).toEqual({
        _tag: 'Redirect',
        route: settings(),
      });
  });

  it('open Settings on the tab a link asked for, once, else General', () => {
    expect(settingsTabAsked()).toBe('General');
    openSettingsOn('Connections');
    expect(settingsTabAsked()).toBe('Connections');
    expect(settingsTabAsked()).toBe('General');
  });

  it('name every Route the router reads', () => {
    expectTypeOf<Route>().toEqualTypeOf<typeof router.route.Type>();
  });
});
