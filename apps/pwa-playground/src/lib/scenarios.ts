export const SCENARIO_GROUPS = [
  'Install',
  'Offline & caching',
  'Updates',
  'Worker RPC',
  'Safety',
  'Gestures',
] as const;

export type ScenarioGroup = (typeof SCENARIO_GROUPS)[number];

export interface Scenario {
  readonly path: string;
  readonly title: string;
  readonly summary: string;
  readonly group: ScenarioGroup;
}

/** In reading order: the nav, prev/next links and transition direction follow it. */
export const scenarios: ReadonlyArray<Scenario> = [
  {
    path: '/install',
    title: 'Install Prompt',
    summary: 'The browser install flow, or manual steps on iOS.',
    group: 'Install',
  },
  {
    path: '/status',
    title: 'Status',
    summary: 'Build ID, worker and registration state, storage, caches.',
    group: 'Install',
  },
  {
    path: '/runtime-cache',
    title: 'Runtime Cache',
    summary: 'One endpoint per strategy; see which answers come from cache.',
    group: 'Offline & caching',
  },
  {
    path: '/data',
    title: 'Route data offline',
    summary: 'A loader whose data is cached network-first.',
    group: 'Offline & caching',
  },
  {
    path: '/offline',
    title: 'Offline Fallback',
    summary: 'The page shown for a navigation with no network and no cache.',
    group: 'Offline & caching',
  },
  {
    path: '/update',
    title: 'Update Prompt',
    summary: 'Check for a new build and reload every tab into it.',
    group: 'Updates',
  },
  {
    path: '/rpc',
    title: 'Worker RPC',
    summary: 'Unary and streaming calls into the service worker.',
    group: 'Worker RPC',
  },
  {
    path: '/auth-sim',
    title: 'Auth never cached',
    summary: 'A session endpoint the worker never caches; sign-out clears.',
    group: 'Safety',
  },
  {
    path: '/gestures',
    title: 'Gesture Lab',
    summary:
      'Ten Cases of nested zones, trapping and useGesture, every finger drawn.',
    group: 'Gestures',
  },
  {
    path: '/motion',
    title: 'Motion 101',
    summary: 'Velocity, springs, momentum and bounds, taught with live demos.',
    group: 'Gestures',
  },
];

/** Position in reading order; the home page is -1, unknown paths null. */
export const scenarioIndex = (pathname: string): number | null => {
  if (pathname === '/') return -1;
  const index = scenarios.findIndex((s) => s.path === pathname);
  return index === -1 ? null : index;
};

export const scenarioAt = (pathname: string): Scenario | undefined =>
  scenarios.find((s) => s.path === pathname);

/**
 * View-transition types for a route change, for the router's
 * `defaultViewTransition`: `forward` deeper into the scenario list, `back`
 * toward the overview. `false` skips the transition: the first render, a
 * reload of the same page, or reduced motion. styles.css keys the animations
 * off these types.
 */
export const viewTransitionTypes = (change: {
  readonly fromLocation?: { readonly pathname: string };
  readonly toLocation: { readonly pathname: string };
  readonly pathChanged: boolean;
}): Array<string> | false => {
  if (change.fromLocation === undefined || !change.pathChanged) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }
  const from = scenarioIndex(change.fromLocation.pathname);
  const to = scenarioIndex(change.toLocation.pathname);
  if (from === null || to === null) return ['fade'];
  return [to > from ? 'forward' : 'back'];
};
