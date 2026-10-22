import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  home,
  project,
  session,
  settings,
  type Place,
} from '../places/index.ts';
import { router } from './actor.ts';

describe('places', () => {
  it('are the Routes the router makes', () => {
    expect(home()).toEqual(router.Home());
    expect(settings()).toEqual(router.Settings());
    expect(project('p1')).toEqual(router.Project({ projectId: 'p1' }));
    expect(session('p1', 's1')).toEqual(
      router.Project.Session({ projectId: 'p1', sessionId: 's1' }),
    );
  });

  it('name every Route the router reads', () => {
    expectTypeOf<Place>().toEqualTypeOf<typeof router.route.Type>();
  });
});
