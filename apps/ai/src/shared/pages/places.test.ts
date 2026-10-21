import { describe, expect, it } from 'vitest';
import { router } from './pages.ts';
import { home, project, session, settings } from './places/index.ts';

describe('places', () => {
  it('are the Routes the router makes', () => {
    expect(home()).toEqual(router.Home());
    expect(settings()).toEqual(router.Settings());
    expect(project('p1')).toEqual(router.Project({ projectId: 'p1' }));
    expect(session('p1', 's1')).toEqual(
      router.Project.Session({ projectId: 'p1', sessionId: 's1' }),
    );
  });
});
