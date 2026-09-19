import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { routeFor, type Screen, type Visitor } from './route.js';

export { returnDestination } from './route.js';

const visitorOf = (session: { data: unknown; isPending: boolean }): Visitor =>
  session.isPending ? 'unknown' : session.data ? 'signed-in' : 'signed-out';

export function useScreenRoute(
  screen: Screen,
  session: { data: unknown; isPending: boolean },
): boolean {
  const navigate = useNavigate();
  const route = routeFor(screen, visitorOf(session), window.location);
  const to = route.kind === 'go' ? route.to : undefined;
  useEffect(() => {
    if (to) void navigate({ href: to, replace: true });
  }, [navigate, to]);
  return route.kind === 'show';
}
