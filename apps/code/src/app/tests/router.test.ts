import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  home,
  openSettingsOn,
  project,
  type Route,
  session,
  settings,
  settingsTabAsked,
} from '../app.ts';
import { router } from '../index.ts';

describe('routes', () => {
  it('are the Routes the router makes', () => {
    expect(home('a1')).toEqual(router.Account.Home({ accountId: 'a1' }));
    expect(settings('a1')).toEqual(
      router.Account.Settings({ accountId: 'a1' }),
    );
    expect(project('a1', 'm1', 'p1')).toEqual(
      router.Account.Project({
        accountId: 'a1',
        connectionId: 'm1',
        projectId: 'p1',
      }),
    );
    expect(session('a1', 'm1', 'p1', 's1')).toEqual(
      router.Account.Project.Session({
        accountId: 'a1',
        connectionId: 'm1',
        projectId: 'p1',
        sessionId: 's1',
      }),
    );
  });

  it('are at their paths, each under its Account', () => {
    expect(router.path(home('a1'))).toBe('/a/a1');
    expect(router.path(settings('a1'))).toBe('/a/a1/settings');
    expect(router.path(project('a1', 'm1', 'p1'))).toBe('/a/a1/m/m1/p/p1');
    expect(router.path(session('a1', 'm1', 'p1', 's1'))).toBe(
      '/a/a1/m/m1/p/p1/s/s1',
    );
    expect(router.read('/a/a1')).toEqual({ _tag: 'At', route: home('a1') });
    expect(router.read('/a/a1/settings')).toEqual({
      _tag: 'At',
      route: settings('a1'),
    });
  });

  it('name no page at the addresses the app had before, which the root page moves', () => {
    for (const path of ['/', '/settings', '/m/m1/p/p1', '/m/m1/p/p1/s/s1'])
      expect(router.read(path)).toEqual({
        _tag: 'At',
        route: { _tag: 'NotFound', path },
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
